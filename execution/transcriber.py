import os
import uuid
import yt_dlp
import asyncio
import google.generativeai as genai
from analyzer import configure_genai, extract_thumbnail, cleanup_temp_files, TMP_DIR

configure_genai()


async def get_youtube_title(link: str) -> str:
    """Extrai o título original do vídeo no YouTube via yt-dlp."""
    ydl_opts = {
        'quiet': True,
        'no_check_certificate': True,
        'skip_download': True,
    }
    try:
        def run():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(link, download=False)
                return info.get('title', 'Sem título')
        return await asyncio.to_thread(run)
    except Exception as e:
        print(f"Erro ao extrair título: {e}")
        return "Sem título"


async def download_youtube_video(link: str, progress_callback=None) -> str:
    """Faz download de vídeo do YouTube usando yt-dlp."""
    if progress_callback:
        await progress_callback(f"Iniciando download: {link}", 5)

    filename = f"{uuid.uuid4()}.mp4"
    out_tmpl = os.path.join(TMP_DIR, filename)

    ydl_opts = {
        'format': 'best',
        'outtmpl': out_tmpl,
        'noplaylist': True,
        'quiet': True,
        'no_check_certificate': True,
    }

    try:
        def run_ydl():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([link])

        await asyncio.to_thread(run_ydl)

        if progress_callback:
            await progress_callback(f"Download concluído.", 20)
        return out_tmpl
    except Exception as e:
        print(f"Erro ao baixar {link}: {e}")
        if progress_callback:
            await progress_callback(f"Erro no download: {str(e)}", 20)
        return None


async def transcribe_video(fp: str, progress_callback=None) -> str:
    """Envia o vídeo ao Gemini e retorna a transcrição bruta + resumo curto."""
    current_key = configure_genai()
    if not current_key:
        return "Erro: GEMINI_API_KEY não configurada.", ""

    model = genai.GenerativeModel(model_name="gemini-2.5-flash")
    uploaded_file = None

    try:
        if progress_callback:
            await progress_callback("Enviando vídeo para transcrição...", 30)

        uploaded_file = await asyncio.to_thread(genai.upload_file, path=fp)

        if progress_callback:
            await progress_callback("Processando vídeo...", 40)

        while uploaded_file.state.name == "PROCESSING":
            await asyncio.sleep(5)
            uploaded_file = await asyncio.to_thread(genai.get_file, uploaded_file.name)

        if uploaded_file.state.name == "FAILED":
            return "Erro: O Gemini não conseguiu processar este vídeo.", ""

        if progress_callback:
            await progress_callback("Gerando transcrição completa...", 60)

        prompt = (
            "Transcreva INTEGRALMENTE o áudio deste vídeo em português. "
            "Sua resposta deve seguir EXATAMENTE este formato:\n\n"
            "[RESUMO]\n"
            "Um parágrafo curto (2-3 frases) resumindo o conteúdo do vídeo.\n"
            "[/RESUMO]\n\n"
            "[TRANSCRICAO]\n"
            "A transcrição completa e fiel do áudio do vídeo, palavra por palavra.\n"
            "[/TRANSCRICAO]\n\n"
            "IMPORTANTE: Transcreva TODO o conteúdo falado, sem omitir nada. "
            "Mantenha a linguagem original usada no vídeo."
        )

        contents = [uploaded_file, prompt]
        response = await asyncio.to_thread(model.generate_content, contents)
        full_text = response.text

        # Extrai resumo e transcrição
        summary = ""
        transcription = full_text

        if "[RESUMO]" in full_text and "[/RESUMO]" in full_text:
            try:
                summary = full_text.split("[RESUMO]")[1].split("[/RESUMO]")[0].strip()
            except:
                pass

        if "[TRANSCRICAO]" in full_text and "[/TRANSCRICAO]" in full_text:
            try:
                transcription = full_text.split("[TRANSCRICAO]")[1].split("[/TRANSCRICAO]")[0].strip()
            except:
                pass

        if progress_callback:
            await progress_callback("Transcrição concluída!", 95)

        return transcription, summary

    except Exception as e:
        if progress_callback:
            await progress_callback(f"Erro na transcrição: {str(e)}", 100)
        return f"Erro na transcrição via IA: {e}", ""

    finally:
        if uploaded_file:
            try:
                await asyncio.to_thread(genai.delete_file, uploaded_file.name)
            except:
                pass
