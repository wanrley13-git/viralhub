import os
import time
import zipfile
import uuid
import yt_dlp
import shutil
import google.generativeai as genai
from dotenv import load_dotenv
import asyncio
import cv2

TMP_THUMBNAILS_DIR = os.path.join(os.path.dirname(__file__), ".tmp", "thumbnails")
os.makedirs(TMP_THUMBNAILS_DIR, exist_ok=True)

def extract_thumbnail(video_path: str) -> str:
    """Extrai o primeiro frame do vídeo e salva como JPG."""
    try:
        cap = cv2.VideoCapture(video_path)
        success, frame = cap.read()
        if success:
            thumb_name = f"thumb_{uuid.uuid4()}.jpg"
            thumb_path = os.path.join(TMP_THUMBNAILS_DIR, thumb_name)
            # Redimensiona para manter leve (ex: 480p de largura)
            height, width = frame.shape[:2]
            new_width = 480
            new_height = int(height * (new_width / width))
            resized = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
            cv2.imwrite(thumb_path, resized)
            cap.release()
            return thumb_name
        cap.release()
    except Exception as e:
        print(f"Erro ao extrair miniatura: {e}")
    return None

# Carrega variáveis de ambiente
def configure_genai():
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'), override=True)
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
    return api_key

api_key = configure_genai()

TMP_DIR = os.path.join(os.path.dirname(__file__), '..', '.tmp')
os.makedirs(TMP_DIR, exist_ok=True)

PROMPT_FILE = os.path.join(os.path.dirname(__file__), '..', 'directives', 'prompt-agente-viral-v2.md')

def get_system_instruction():
    if os.path.exists(PROMPT_FILE):
        with open(PROMPT_FILE, 'r', encoding='utf-8') as f:
            return f.read()
    return "Você é o ViralAnalyst. Analise os vídeos enviados."

async def download_video(link: str, progress_callback=None) -> str:
    """Faz download de vídeo de links (YouTube, TikTok, Instagram) usando yt_dlp"""
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
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'referer': 'https://www.instagram.com/',
    }
    
    try:
        # Loop executor para rodar yt-dlp síncrono de forma não-bloqueante
        def run_ydl():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([link])
        
        await asyncio.to_thread(run_ydl)
        
        if progress_callback:
            await progress_callback(f"Download concluído: {link}", 15)
        return out_tmpl
    except Exception as e:
        print(f"Erro ao baixar {link}: {e}")
        if progress_callback:
            await progress_callback(f"Erro no download: {str(e)}", 15)
        return None

async def extract_zip(zip_path: str, progress_callback=None) -> list[str]:
    """Extrai vídeos de um arquivo ZIP e retorna a lista de caminhos"""
    if progress_callback:
        await progress_callback("Extraindo arquivos do ZIP...", 10)
        
    # Cria pasta temporária exclusiva para este extração
    extract_folder = os.path.join(TMP_DIR, str(uuid.uuid4()))
    os.makedirs(extract_folder, exist_ok=True)
    
    valid_extensions = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".3gp", ".3g2", ".mpg", ".mpeg"}
    extracted_files = []
    ignored_files = []
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_folder)
            
        for root, dirs, files in os.walk(extract_folder):
            for file in files:
                if file.startswith('._') or file.startswith('__MACOSX'):
                    continue
                    
                ext = os.path.splitext(file)[1].lower()
                file_path = os.path.join(root, file)
                
                if ext in valid_extensions:
                    extracted_files.append(file_path)
                else:
                    ignored_files.append(file)
        
        if progress_callback:
            if ignored_files:
                await progress_callback(f"Aviso: Ignorados {len(ignored_files)} arquivos não-vídeo ({', '.join(ignored_files[:3])}...)", 20)
            await progress_callback(f"ZIP extraído: {len(extracted_files)} vídeos prontos para análise.", 20)
    except Exception as e:
        print(f"Erro ao extrair zip: {e}")
        if progress_callback:
            await progress_callback(f"Erro ao extrair ZIP: {str(e)}", 20)
        
    return extracted_files

async def analyze_single_video(fp: str, progress_callback=None, idx=1, total=1) -> tuple[str, str]:
    """Análise vídeos usando IA Multimodal (focado em apenas 1 vídeo)"""
    current_key = configure_genai()
    if not current_key:
        return "Erro: GEMINI_API_KEY não configurada no arquivo .env", "Erro"
        
    system_instruction = get_system_instruction()
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=system_instruction
    )
    
    uploaded_file = None
    
    try:
        if not os.path.exists(fp):
            return "Erro: O arquivo não pôde ser encontrado localmente.", "Erro"
            
        fname = os.path.basename(fp)
        if progress_callback:
            p = 25 + int((idx / total) * 30)
            await progress_callback(f"Enviando para análise técnica [{idx}/{total}]: {fname}", p)
            
        # Upload síncrono em thread
        uploaded_file = await asyncio.to_thread(genai.upload_file, path=fp)
        
        # Aguarda o processamento do vídeo
        if progress_callback:
            await progress_callback(f"Processando vídeo [{idx}/{total}]: {fname}...", p + 5)
            
        while uploaded_file.state.name == "PROCESSING":
            await asyncio.sleep(5)
            uploaded_file = await asyncio.to_thread(genai.get_file, uploaded_file.name)
            
        if uploaded_file.state.name == "FAILED":
            if progress_callback:
                await progress_callback(f"⚠️ Falha ao processar arquivo ({fname}): Formato incompatível ou erro no AI Studio.", p + 5)
            return "Erro: O Google Gemini não conseguiu processar este arquivo de vídeo.", "Erro Incompatível"
            
        if progress_callback:
            await progress_callback(f"Geração de inteligência do vídeo [{idx}/{total}]...", 85)
            
        prompt = "Analise rigorosamente ESTE vídeo seguindo as diretrizes técnicas. Use APENAS divisores padrão do Markdown (ex: ---). IMPORTANTE: Na primeira linha da sua resposta, ANTES do relatório, forneça APENAS um título incrível, direto e que remete exatamente ao contexto DESSE vídeo de no máximo 4 palavras, obrigatoriamente entre colchetes, assim: [TITULO: Seu Titulo]"
        
        contents = [uploaded_file, prompt]
        response = await asyncio.to_thread(model.generate_content, contents)
        full_text = response.text
        
        # Extrai título dinâmico com Robustez contra quebras de linha
        title = f"Análise do Vídeo {idx}"
        report_md = full_text
        
        if "[TITULO:" in full_text:
            try:
                # Divide pela tag
                parts = full_text.split("[TITULO:", 1)
                after_tag = parts[1]
                title_part = after_tag.split("]", 1)[0].strip()
                title = "".join([c for c in title_part if c not in ['"', "'", "\n", "\r", "*"]])
                report_md = after_tag.split("]", 1)[1].strip() if "]" in after_tag else full_text
            except Exception as e:
                print("Erro no split de título:", e)

        if progress_callback:
            await progress_callback(f"Análise Completa: {title}", int(100 * (idx/total)))
            
        return report_md, title
        
    except Exception as e:
        if progress_callback:
            await progress_callback(f"Erro crítico na IA no vídeo {idx}: {str(e)}", 100)
        return f"Erro na análise via IA: {e}", "Erro de Inteligência"
        
    finally:
        # Cleanup na nuvem para esse arquivo
        if uploaded_file:
            try:
                await asyncio.to_thread(genai.delete_file, uploaded_file.name)
            except:
                pass
            
def cleanup_temp_files(paths: list[str]):
    """Apaga os arquivos locais após a conclusão da request"""
    for p in paths:
        try:
            if os.path.isdir(p):
                shutil.rmtree(p)
            else:
                os.remove(p)
        except:
            pass
