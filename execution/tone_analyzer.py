import os
import asyncio
import google.generativeai as genai
from analyzer import configure_genai

configure_genai()

EXEMPLO_PERFIL_VOZ = os.path.join(os.path.dirname(__file__), '..', 'directives', 'exemplo-perfil-voz.md')

def get_tone_system_instruction():
    example = ""
    if os.path.exists(EXEMPLO_PERFIL_VOZ):
        with open(EXEMPLO_PERFIL_VOZ, 'r', encoding='utf-8') as f:
            example = f.read()
    return example


async def analyze_tone(video_paths: list[str], progress_callback=None, notes: str = "") -> str:
    """Analisa o tom/estilo dos vídeos usando Gemini e retorna um perfil de tom."""
    current_key = configure_genai()
    if not current_key:
        return "Erro: GEMINI_API_KEY não configurada."

    tone_instruction = get_tone_system_instruction()
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=tone_instruction if tone_instruction else None
    )
    uploaded_files = []

    try:
        total = len(video_paths)
        for idx, fp in enumerate(video_paths):
            if not os.path.exists(fp):
                continue

            if progress_callback:
                pct = 20 + int((idx / total) * 30)
                await progress_callback(f"Enviando vídeo [{idx+1}/{total}] para análise de tom...", pct)

            uf = await asyncio.to_thread(genai.upload_file, path=fp)

            while uf.state.name == "PROCESSING":
                await asyncio.sleep(5)
                uf = await asyncio.to_thread(genai.get_file, uf.name)

            if uf.state.name == "FAILED":
                if progress_callback:
                    await progress_callback(f"Falha ao processar vídeo {idx+1}.", 50)
                continue

            uploaded_files.append(uf)

        if not uploaded_files:
            return "Erro: Nenhum vídeo pôde ser processado."

        if progress_callback:
            await progress_callback("Analisando tom e estilo dos vídeos...", 70)

        prompt = (
            "Analise o TOM, ESTILO e PERSONALIDADE do(s) criador(es) neste(s) vídeo(s). "
            "Gere um PERFIL DE VOZ completo seguindo EXATAMENTE a mesma estrutura e formato "
            "do exemplo fornecido na instrução de sistema. "
            "O perfil deve conter todas as seções: RESUMO EM 1 PARÁGRAFO, VOCABULÁRIO, ESTRUTURA, "
            "RITMO E ENERGIA, PERSONALIDADE, COMO ESCREVER NESSA VOZ, RESTRIÇÕES DO USUÁRIO e FRASES DE REFERÊNCIA. "
            "Use citações reais extraídas dos vídeos como exemplos. "
            "O resultado deve ser um guia prático e fiel que permita replicar a voz desse criador em novos conteúdos."
        )

        if notes.strip():
            prompt += f"\n\nINFORMAÇÕES ADICIONAIS DO USUÁRIO SOBRE O TOM:\n{notes}"

        contents = list(uploaded_files) + [prompt]
        response = await asyncio.to_thread(model.generate_content, contents)

        if progress_callback:
            await progress_callback("Tom analisado com sucesso!", 95)

        return response.text

    except Exception as e:
        if progress_callback:
            await progress_callback(f"Erro na análise de tom: {str(e)}", 100)
        return f"Erro na análise de tom: {e}"

    finally:
        for uf in uploaded_files:
            try:
                await asyncio.to_thread(genai.delete_file, uf.name)
            except:
                pass
