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

from storage import upload_file as _upload_to_storage


def extract_thumbnail(video_path: str) -> str:
    """Extrai o primeiro frame do vídeo, faz upload ao Supabase Storage
    e retorna a URL pública. Retorna None se falhar."""
    try:
        cap = cv2.VideoCapture(video_path)
        success, frame = cap.read()
        if success:
            thumb_name = f"thumb_{uuid.uuid4()}.jpg"
            thumb_path = os.path.join(TMP_THUMBNAILS_DIR, thumb_name)
            height, width = frame.shape[:2]
            new_width = 480
            new_height = int(height * (new_width / width))
            resized = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
            cv2.imwrite(thumb_path, resized)
            cap.release()
            # Upload to Supabase Storage
            with open(thumb_path, "rb") as f:
                public_url = _upload_to_storage(f.read(), thumb_name, "image/jpeg")
            if public_url:
                return public_url
            # Fallback: return local path if upload fails
            return f"/thumbnails/{thumb_name}"
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

def _resolve_prompt_file() -> str:
    """Resolve prompt-agente-viral-v2.md. Prefers execution/directives/
    (co-located with the backend, always deployed)."""
    this_file = os.path.abspath(__file__)
    execution_dir = os.path.dirname(this_file)
    project_root = os.path.dirname(execution_dir)
    filename = 'prompt-agente-viral-v2.md'
    candidates = [
        os.path.join(execution_dir, 'directives', filename),
        os.path.join(project_root, 'directives', filename),
        os.path.join('/app', 'directives', filename),
        os.path.join('/app', 'execution', 'directives', filename),
        os.path.join(os.getcwd(), 'directives', filename),
        os.path.join(os.getcwd(), '..', 'directives', filename),
    ]
    for p in candidates:
        abs_p = os.path.abspath(p)
        if os.path.exists(abs_p):
            return abs_p
    return os.path.abspath(candidates[0])  # fallback for logging

PROMPT_FILE = _resolve_prompt_file()

def get_system_instruction():
    if os.path.exists(PROMPT_FILE):
        with open(PROMPT_FILE, 'r', encoding='utf-8') as f:
            return f.read()
    print(f"WARN: prompt file não encontrado em {PROMPT_FILE}")
    return "Você é o ViralAnalyst. Analise os vídeos enviados."

# ─── Download error classification ───────────────────────────────────
# Markers that indicate Instagram / TikTok / YouTube is throttling us and
# a retry after a short backoff has a decent chance of succeeding.
_RATE_LIMIT_MARKERS = (
    'rate-limit', 'rate limit', 'ratelimit',
    'login required', 'login-required',
    'too many requests', '429',
)

def _is_rate_limit_error(raw: str) -> bool:
    if not raw:
        return False
    lower = raw.lower()
    return any(m in lower for m in _RATE_LIMIT_MARKERS)

def _classify_download_error(raw: str, link: str) -> tuple[str, str]:
    """Turn a raw yt-dlp exception string into (short_message, hint).

    `short_message` is a one-line, ANSI-stripped, length-capped version of
    the first line of the exception. `hint` is a friendly "(...)" suffix
    that suggests the likely cause to the end user.
    """
    import re as _re
    clean = _re.sub(r'\x1b\[[0-9;]*m', '', raw or '')
    short = clean.strip().split('\n')[0][:200] if clean.strip() else 'erro desconhecido'

    link_lower = link.lower()
    is_instagram = "instagram.com" in link_lower
    is_tiktok = "tiktok.com" in link_lower
    is_youtube = "youtube.com" in link_lower or "youtu.be" in link_lower
    platform = 'Instagram' if is_instagram else 'TikTok' if is_tiktok else 'YouTube' if is_youtube else 'link'

    lower = clean.lower()
    hint = ''
    if 'login' in lower or 'rate' in lower or 'unavailable' in lower or 'restricted' in lower or 'private' in lower:
        hint = f' (o {platform} pode estar exigindo login, ou o post é privado/restrito)'
    elif 'unsupported url' in lower:
        hint = ' (URL não suportada pelo yt-dlp)'
    elif '404' in clean or 'not found' in lower:
        hint = ' (vídeo não encontrado ou removido)'

    return short, hint


async def _download_video_once(link: str, progress_callback=None, attempt_label: str = "") -> tuple[str | None, str | None]:
    """Single download attempt. Returns (local_path, None) on success or
    (None, raw_error_string) on failure. Does NOT log failures — the
    caller decides whether to retry or to report a definitive failure."""
    prefix = f"[{attempt_label}] " if attempt_label else ""
    if progress_callback:
        await progress_callback(f"{prefix}Iniciando download: {link}", 5)

    filename = f"{uuid.uuid4()}.mp4"
    out_tmpl = os.path.join(TMP_DIR, filename)

    # Platform detection to pass platform-specific tweaks
    link_lower = link.lower()
    is_instagram = "instagram.com" in link_lower
    is_tiktok = "tiktok.com" in link_lower
    is_youtube = "youtube.com" in link_lower or "youtu.be" in link_lower

    ydl_opts = {
        'format': 'best[ext=mp4]/best',
        'outtmpl': out_tmpl,
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'no_check_certificate': True,
        'retries': 3,
        'fragment_retries': 3,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    }

    if is_instagram:
        ydl_opts['referer'] = 'https://www.instagram.com/'
        # Instagram frequently requires a realistic browser fingerprint
        ydl_opts['http_headers'] = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
        }
    elif is_tiktok:
        ydl_opts['referer'] = 'https://www.tiktok.com/'
    elif is_youtube:
        # Workarounds for YouTube age / consent walls
        ydl_opts['extractor_args'] = {'youtube': {'player_client': ['web', 'android']}}

    try:
        # Loop executor para rodar yt-dlp síncrono de forma não-bloqueante
        def run_ydl():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([link])

        await asyncio.to_thread(run_ydl)

        if progress_callback:
            await progress_callback(f"{prefix}Download concluído: {link}", 15)
        return out_tmpl, None
    except Exception as e:
        raw = str(e)
        print(f"Erro ao baixar {link}: {raw}")
        return None, raw


async def download_video(link: str, progress_callback=None) -> str | None:
    """Backwards-compatible single-link download.

    Returns the local file path on success, or None on failure (with an
    error message pushed through `progress_callback`). Preserves the
    exact behavior older callers rely on (single link, no retry, no
    inter-download delay).
    """
    path, err = await _download_video_once(link, progress_callback)
    if path:
        return path
    # Report the failure in the same format the old implementation used,
    # so existing UI error surfacing keeps working untouched.
    short, hint = _classify_download_error(err or 'erro desconhecido', link)
    if progress_callback:
        await progress_callback(f"Falha no download de {link}: {short}{hint}", 15)
    return None


async def download_videos_batch(
    links: list[str],
    progress_callback=None,
) -> list[dict]:
    """Download multiple videos sequentially with rate-limit handling.

    Behavior:
      • Single link → no delay, no extra ceremony (equivalent to the old
        download_video). A rate-limit retry still fires as a safety net.
      • Multi-link → a progressive polite delay between downloads that
        grows as the batch gets longer (4s for 1–10, 6s for 11–20, 8s
        for 21–30, etc.) to avoid tripping Instagram/TikTok/YouTube
        rate limits.
      • Every 15 successful downloads, a 15s "cooldown" pause is
        inserted on top of the normal delay — large Instagram batches
        reliably trigger rate-limits around that threshold.
      • On rate-limit-looking errors, up to 3 retries with exponential
        backoff: 10s, 30s, 60s.
      • On definitive failure, record the error and CONTINUE with the
        remaining links — never abort the whole batch.
      • Logs an ETA (average per-download time × remaining links) so
        the frontend can show "restam ~Xm:YYs" while the batch runs.

    Returns a list of result dicts, one per input link:
        [{"link": str, "path": str | None, "error": str | None}, ...]
    Successful entries have `error=None`; failed entries have `path=None`
    and a human-friendly `error` string.
    """
    results: list[dict] = []
    total = len(links)
    is_batch = total > 1
    BASE_DELAY_S = 4                   # baseline polite delay
    DELAY_STEP_S = 2                   # +2s every DELAY_BUCKET downloads
    DELAY_BUCKET = 10                  # grow delay every N downloads
    COOLDOWN_EVERY = 15                # trigger extra pause every N successes
    COOLDOWN_S = 15                    # length of the extra pause
    RATE_LIMIT_BACKOFFS_S = [10, 30, 60]  # exponential-ish retries

    success_count = 0
    downloads_since_cooldown = 0
    total_download_time_s = 0.0

    for idx, link in enumerate(links):
        # Polite delay between downloads in a batch (never before the first).
        # Delay grows with batch depth: 4s for 1–10, 6s for 11–20, 8s for 21–30…
        if is_batch and idx > 0:
            delay = BASE_DELAY_S + DELAY_STEP_S * (idx // DELAY_BUCKET)
            if progress_callback:
                await progress_callback(
                    f"Aguardando {delay}s antes do próximo download ({idx+1}/{total})...",
                    5,
                )
            await asyncio.sleep(delay)

            # Extra cooldown every 15 successful downloads to give the
            # platform a breather and reset rate-limit counters.
            if downloads_since_cooldown >= COOLDOWN_EVERY:
                if progress_callback:
                    await progress_callback(
                        f"Cooldown anti-rate-limit: pausando {COOLDOWN_S}s após {success_count} downloads bem-sucedidos...",
                        5,
                    )
                await asyncio.sleep(COOLDOWN_S)
                downloads_since_cooldown = 0

        # ── Attempt 1 ──
        dl_start = time.monotonic()
        path, err = await _download_video_once(link, progress_callback)

        # ── Progressive retries on rate-limit errors (up to 3 tries) ──
        retry_idx = 0
        while (
            path is None
            and _is_rate_limit_error(err or '')
            and retry_idx < len(RATE_LIMIT_BACKOFFS_S)
        ):
            wait_s = RATE_LIMIT_BACKOFFS_S[retry_idx]
            retry_idx += 1
            if progress_callback:
                await progress_callback(
                    f"Rate-limit detectado em {link}. Retry {retry_idx}/{len(RATE_LIMIT_BACKOFFS_S)} em {wait_s}s...",
                    10,
                )
            await asyncio.sleep(wait_s)
            path, err = await _download_video_once(
                link, progress_callback, attempt_label=f"retry {retry_idx}"
            )

        if path:
            success_count += 1
            downloads_since_cooldown += 1
            total_download_time_s += time.monotonic() - dl_start
            # ETA for remaining links, based on average per-download time
            # plus the expected inter-download delay of the *next* slot.
            remaining = total - (idx + 1)
            if is_batch and remaining > 0 and progress_callback:
                avg_dl = total_download_time_s / success_count
                next_delay = BASE_DELAY_S + DELAY_STEP_S * ((idx + 1) // DELAY_BUCKET)
                eta_s = int(remaining * (avg_dl + next_delay))
                mins, secs = divmod(max(eta_s, 0), 60)
                eta_label = f"{mins}m{secs:02d}s" if mins else f"{secs}s"
                await progress_callback(
                    f"Progresso do batch: {idx+1}/{total} • restam ~{eta_label}",
                    min(20, 5 + int(15 * (idx + 1) / total)),
                )
            results.append({"link": link, "path": path, "error": None})
        else:
            short, hint = _classify_download_error(err or 'erro desconhecido', link)
            friendly = f"{short}{hint}"
            if progress_callback:
                await progress_callback(
                    f"Falha definitiva no download de {link}: {friendly}",
                    15,
                )
            results.append({"link": link, "path": None, "error": friendly})

    # Emit a batch-level summary so the frontend's log panel shows a
    # clean "X de Y" line at the end instead of the user scanning raw
    # error messages to figure out how many actually succeeded.
    if is_batch and progress_callback:
        ok = sum(1 for r in results if r["path"])
        ko = total - ok
        await progress_callback(
            f"Downloads concluídos: {ok}/{total} com sucesso" + (f", {ko} falharam." if ko else "."),
            20,
        )

    return results

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
