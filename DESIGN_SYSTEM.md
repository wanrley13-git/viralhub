# ViralHub — Design System

> Documento auto-contido. Tudo aqui foi extraído do código real do projeto
> (`web-app/tailwind.config.js`, `web-app/src/index.css`, `web-app/index.html`,
> `web-app/src/components/`, `web-app/src/pages/`). Nada inventado.
>
> **Como usar este documento:** leia inteiro, copie a seção §15 (prompt pronto)
> pra reaplicar a identidade em outras IAs, ou consulte componentes individuais
> em §9.

---

## 1. Identidade Visual

ViralHub é uma interface **dark premium com glassmorphismo intenso**, ancorada
em verde esmeralda (`#37B24D`) sobre preto-quase-puro (`#08080A`). A
tipografia combina **Plus Jakarta Sans** (humanista geométrica para UI),
**Instrument Serif** itálica (frases decorativas curtas, tipo "tagline") e
**IBM Plex Mono** (labels de metadados em uppercase com letter-spacing
exagerado). A textura visual vem de uma camada SVG `feTurbulence` em mix-blend
overlay aplicada sobre todo o `<body>`. Botões, cards e inputs adotam
**border-radius generosos** (16-24px) e **animações por cubic-bezier
"ease-out-expo"** (`0.16, 1, 0.3, 1`), com micro-interações de scale e
translate sempre sutis. A hierarquia depende de **extremos de peso** (extrabold
800 vs regular 400, mono 600 uppercase em labels).

---

## 2. Paleta de Cores

Todas as cores são tokens do `tailwind.config.js` ou aparecem em uso
recorrente no código.

### 2.1. Tokens nomeados (Tailwind)

| Token | Hex / RGBA | Uso real |
|---|---|---|
| `background` | `#08080A` | Fundo da aplicação (`<body>`). Único valor de fundo da página. |
| `surface` | `#111114` | Sidebar (`bg-surface/95`), modais sólidos, headers. |
| `surface-flat` | `#18181D` | `.input-field`, `.tab-group`, fundos de seções planas. |
| `surface-raised` | `#1F1F26` | `code` inline em markdown, fundos de avatares e chips. |
| `primary` | `#37B24D` | Cor de marca. Usada em botão primário, estado ativo, glow, foco de input, accent rail de toast success. |
| `primary-hover` | `#2F9E44` | Hover de `.btn-primary` (verde mais escuro). |
| `primary-glow` | `rgba(55,178,77,0.12)` | Token Tailwind (definido mas raramente usado direto — em vez disso o código usa `bg-primary/8`, `/10`, `/12` à mão). |
| `accent` | `#69DB7C` | Verde mais claro. Usado em `code`, links de markdown, note-link, `[[wiki]]`, status pulse. |
| `accent-muted` | `rgba(105,219,124,0.1)` | Definido no Tailwind, **sem uso direto** (inconsistência). |
| `border-subtle` | `rgba(255,255,255,0.06)` | Borda padrão de cards, modais, inputs, separadores. |
| `border-hover` | `rgba(255,255,255,0.12)` | Hover de cards (`hover:border-border-hover`). |

### 2.2. Cinzas (Tailwind defaults usados)

| Classe | Aproximado | Uso |
|---|---|---|
| `text-white` | `#FFFFFF` | Títulos h1/h2, texto em destaque, valor em métricas. |
| `text-gray-100` | `#F3F4F6` | `<body>` text default. |
| `text-gray-300` / `text-gray-400` | `#D1D5DB` / `#9CA3AF` | Markdown body, labels secundárias. |
| `text-gray-500` | `#6B7280` | Texto auxiliar, taglines, placeholders. |
| `text-gray-600` | `#4B5563` | Hints, placeholders muito sutis, ícones inativos. |
| `text-gray-700` | — | Placeholders ainda mais apagados (Notes title, TaskEditor). |

### 2.3. Acentos secundários (uso pontual)

| Cor | Hex / Classe | Onde |
|---|---|---|
| Vermelho destrutivo | `#E2272F` (Toast error), `red-500/8`–`/20` (avisos) | Toast error, "Acesso restrito", botão delete confirm. |
| Azul informativo | `#2F6FEB` (Toast info), `blue-500/10`–`/20` | Toast info. |
| Amarelo aviso | `amber-500/8`–`/12`, `amber-400/*` | Estados pendente/atenção. |
| Cores de projeto Kanban | `#06b6d4` `#22c55e` `#8b5cf6` `#f59e0b` `#f43f5e` `#3b82f6` | `SIDEBAR_PROJECT_COLORS` em `Sidebar.jsx`. |

### 2.4. Overlays de transparência canônicos

```
bg-white/[0.04]   →  superfícies muito sutis (input em sidebar)
bg-white/[0.06]   →  hover icon button
bg-white/[0.08]   →  badges, divisores
bg-white/[0.12]   →  borda em hover

bg-black/40       →  overlay leve (sidebar mobile)
bg-black/50       →  overlay padrão de modal
bg-black/60       →  overlay de modal denso (TaskEditor)

bg-primary/[0.06]–/30  →  estados ativos / glow
```

### 2.5. Selection

```css
::selection { background: rgba(55, 178, 77, 0.3); color: white; }
```

---

## 3. Tipografia

### 3.1. Fontes importadas

Todas via Google Fonts em `web-app/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400;1,500;1,600;1,700;1,800&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap" rel="stylesheet" />
```

| Fonte | Pesos | Família Tailwind | Papel |
|---|---|---|---|
| **Plus Jakarta Sans** | 300, 400, 500, 600, 700, 800 (+ itálicos) | `font-sans`, `font-display` | UI inteira, títulos, corpo, botões. |
| **Instrument Serif** | regular + itálico | `font-serif` | **Apenas em taglines decorativas curtas**, sempre em itálico (`font-serif italic`). |
| **IBM Plex Mono** | 300, 400, 500, 600 | `font-mono` | Labels de metadados, métricas (`%`), status uppercase, código inline. |

Tailwind:
```js
fontFamily: {
  'sans':    ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
  'display': ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
  'serif':   ['"Instrument Serif"', 'Georgia', 'serif'],
  'mono':    ['"IBM Plex Mono"', 'monospace'],
}
```

CSS base:
```css
body {
  @apply bg-background text-gray-100 font-sans antialiased;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  letter-spacing: -0.01em;
}
```

### 3.2. Hierarquia real (extraída das pages)

| Papel | Classes exatas | Exemplo |
|---|---|---|
| **Hero h1 (auth)** | `text-3xl font-extrabold text-white tracking-tight` | "ViralHub" no Login. |
| **Hero h2 (página interna)** | `text-4xl font-extrabold text-white tracking-tight` | "Vídeos Longos", "Meus Projetos". |
| **Hero subtítulo serif** | `text-gray-500 text-sm mt-2 font-serif italic` | "O epicentro da sua criação viral" |
| **h1 dentro de Settings** | `text-2xl lg:text-3xl font-black text-white tracking-tight leading-none` | título do perfil. |
| **Section title (markdown h1)** | `text-2xl font-extrabold text-white` + border-bottom | relatórios. |
| **h2 markdown** | `text-xl font-extrabold` | seções. |
| **h3 markdown** | `text-lg font-semibold text-gray-100` | sub-seções. |
| **Métrica grande (mono)** | `text-3xl font-bold text-white font-mono tracking-tight` | "{progress}%" durante análise. |
| **Body padrão markdown** | `font-size: 0.9375rem; line-height: 1.75; color: #d1d5db` | `.markdown-body`. |
| **Card title** | `text-[12px] font-semibold` ou `text-[13px] font-bold text-white` | sidebar items, toast title. |
| **Form label uppercase** | `text-[10px] font-bold text-gray-400 ml-1 tracking-[0.1em] uppercase` | Login email/senha. |
| **`.data-label` (mono)** | font 10px / uppercase / tracking 0.15em / weight 600 / `#6B7280` | "MENU", "MEMBROS", "CONVIDAR MEMBRO". |
| **`.data-label-primary`** | igual, mas `color: #37B24D` | seção destacada. |
| **Status pulse** | `font-mono text-[10px] tracking-widest uppercase text-gray-600` | "Sistema Operacional" no Login. |
| **Tagline serif (vazio)** | `text-gray-600 text-sm font-serif italic` | "Nenhum conteúdo ainda...", "Este card não possui conteúdo." |

### 3.3. Saltos de tamanho

A escala usada é **3x ou mais entre níveis** (segue o anti-AI-slop do CLAUDE.md):

```
10px (data-label)  →  14px (body sidebar)  →  16px (body padrão)
                    →  24px (h2)            →  36px (h2 hero)
                    →  60px+ (métricas %)
```

E **extremos de peso**: 400 vs 800/900 (nunca 400 vs 600).

---

## 4. Espaçamento

A escala é Tailwind padrão (4px base). Padrões recorrentes no código:

| Contexto | Padding | Gap |
|---|---|---|
| **Sidebar item** | `px-3 py-2` (collapsed: `p-2.5`) | `gap-2` |
| **Botão padrão** | `px-5 py-3` ou `py-4` | `gap-2` ou `gap-2.5` |
| **Input grande** | `p-4` (com ícone: `pl-12 p-4`) | — |
| **Card pequeno** | `p-5` | `space-y-3` |
| **Card grande** | `p-7` ou `p-8` | `space-y-4` ou `gap-6` |
| **Modal header** | `p-7 border-b` | — |
| **Modal body** | `p-8 overflow-y-auto` | — |
| **Form section** | `space-y-5` (label/input pairs) | — |
| **Container de página** | `pt-16 px-8` (top), max-width abaixo | — |

---

## 5. Border Radius

Tailwind extends:
```js
borderRadius: {
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  '4xl': '2rem',    // 32px
  '5xl': '2.5rem',  // 40px
  '6xl': '3rem',    // 48px
}
```

| Token | Uso |
|---|---|
| `rounded-md` (6px) | Botão close de toast (X). |
| `rounded-lg` (8px) | Avatar small, badge. |
| `rounded-xl` (12px) | Tab item, dropdown menu, ícone wrapper. |
| `rounded-2xl` (16px) | **Botões padrão**, inputs (`.input-field rounded-2xl`), avisos. |
| `rounded-3xl` (24px) | **Cards de conteúdo** (`glass lift rounded-3xl`), logo wrapper. |
| `rounded-4xl` (32px) | **Modais grandes**, hero cards do auth, "Form Card" do Login. |
| `rounded-full` | Status dots (`w-1.5 h-1.5`), color picker, avatar circular. |

> **Regra geral**: nunca uso uniforme. Botão = 2xl, card = 3xl, modal = 4xl.

---

## 6. Sombras

### 6.1. Tokens `boxShadow` (Tailwind)

```js
boxShadow: {
  'glow-sm':    '0 0 20px rgba(55, 178, 77, 0.15)',
  'glow-md':    '0 0 40px rgba(55, 178, 77, 0.20)',
  'glow-lg':    '0 0 60px rgba(55, 178, 77, 0.25)',
  'card':       '0 8px 32px rgba(0, 0, 0, 0.4)',
  'card-hover': '0 16px 48px rgba(0, 0, 0, 0.5), 0 0 24px rgba(55, 178, 77, 0.06)',
  'modal':      '0 32px 80px rgba(0, 0, 0, 0.6)',
}
```

| Classe | Quando |
|---|---|
| `shadow-glow-sm` | Glow sutil em badges/ícones de sucesso. |
| `shadow-glow-md` | Cards com destaque. |
| `shadow-glow-lg` | Hero element raro. |
| `shadow-card` | Card padrão (também aplicado dentro de `.glass`). |
| `shadow-card-hover` | Hover de card com tinte verde sutil. |
| `shadow-modal` | **Sempre em modais** (`glass-raised ... shadow-modal`). |

### 6.2. Sombras inline observadas

```css
/* .glass — composta */
box-shadow:
  0 8px 32px rgba(0, 0, 0, 0.4),
  inset 0 1px 0 rgba(255, 255, 255, 0.04);

/* .glass-raised — composta */
box-shadow:
  0 16px 48px rgba(0, 0, 0, 0.5),
  inset 0 1px 0 rgba(255, 255, 255, 0.06);

/* .lift:hover */
box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3),
            0 0 24px rgba(55, 178, 77, 0.08);

/* .btn-primary */
box-shadow: 0 4px 20px rgba(55, 178, 77, 0.25);
/* hover */
box-shadow: 0 8px 32px rgba(55, 178, 77, 0.35);

/* .btn-white */
box-shadow: 0 4px 20px rgba(255, 255, 255, 0.10);
/* hover */
box-shadow: 0 8px 32px rgba(255, 255, 255, 0.15);

/* Toast (inline) */
box-shadow: 0 20px 48px rgba(0,0,0,0.55), 0 0 28px <accent>;
```

---

## 7. Efeitos Especiais

### 7.1. Glassmorphismo

Duas variações:

```css
.glass {
  background: rgba(17, 17, 20, 0.6);
  backdrop-filter: blur(40px) saturate(1.2);
  -webkit-backdrop-filter: blur(40px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.glass-raised {
  background: rgba(24, 24, 29, 0.7);
  backdrop-filter: blur(40px) saturate(1.2);
  -webkit-backdrop-filter: blur(40px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 16px 48px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
```

> `.glass` = cards/list items. `.glass-raised` = modais, hero card de auth,
> dropdowns, popovers.

### 7.2. Noise Overlay (SVG `feTurbulence`)

Aplicado em **todo o body**:

```html
<!-- index.html -->
<svg class="fixed pointer-events-none" width="0" height="0">
  <filter id="noise">
    <feTurbulence type="fractalNoise" baseFrequency="0.80" numOctaves="4" stitchTiles="stitch"/>
  </filter>
</svg>
```

```css
/* index.css */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  filter: url(#noise);
  opacity: 0.04;
  mix-blend-mode: overlay;
}
```

> Resultado: textura granulada quase imperceptível em toda a tela. **Sempre
> presente**, nunca desligar.

### 7.3. Gradientes

Não há gradientes em fundos de página. Existem dois usos:

1. **Linhas decorativas finas** (separadores no topo de cards):
   ```html
   <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px
                   bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
   ```

2. **Ambient blobs no Login** (atmosfera atrás do hero card):
   ```html
   <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2
                   w-[600px] h-[600px] bg-primary/8 rounded-full blur-[120px]" />
   ```

---

## 8. Animações e Transições

### 8.1. Curvas de easing (assinatura do projeto)

| Apelido | cubic-bezier | Uso |
|---|---|---|
| **Ease-out-expo** | `0.16, 1, 0.3, 1` | `.lift`, `slideInToast`, `stagger-children`, micro-transições. |
| **Ease-out-quart** | `0.25, 0.46, 0.45, 0.94` | Animações Tailwind (`fadeIn`, `fadeUp`, `slideInRight`, `scaleIn`), botões. |
| **Pulse default** | `0.4, 0, 0.6, 1` | `pulse-slow`. |

### 8.2. Keyframes (CSS)

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes slideInRight {
  0%   { opacity: 0; transform: translateX(-12px); }
  100% { opacity: 1; transform: translateX(0); }
}

@keyframes scaleIn {
  0%   { opacity: 0; transform: scale(0.95); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes glowPulse {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 0.8; }
}

@keyframes slideInToast {
  from { opacity: 0; transform: translateY(16px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

### 8.3. Classes utilitárias

| Classe | Duração | Quando |
|---|---|---|
| `animate-fade-in` | 0.5s | Modal aparecer, card de erro. |
| `animate-fade-up` | 0.6s | Hero do Login, entrada de página. |
| `animate-slide-in-right` | 0.4s | Dropdown lateral. |
| `animate-scale-in` | 0.3s | Pop de modal pequeno. |
| `animate-glow-pulse` | 3s ∞ | Status dots ativos. |
| `animate-pulse-slow` | 3s ∞ | Skeleton placeholder. |
| `animate-pulse` (Tailwind) | 2s ∞ | Skeleton, hint "Sincronizando". |
| `animate-slide-in-toast` | 0.35s | Toast entrando. |
| `animate-spin` (Tailwind) | 1s linear ∞ | Loader2 ícone. |

### 8.4. Stagger de listas

```css
.stagger-children > * {
  opacity: 0;
  animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.stagger-children > *:nth-child(1) { animation-delay: 0s; }
.stagger-children > *:nth-child(2) { animation-delay: 0.06s; }
.stagger-children > *:nth-child(3) { animation-delay: 0.12s; }
.stagger-children > *:nth-child(4) { animation-delay: 0.18s; }
.stagger-children > *:nth-child(5) { animation-delay: 0.24s; }
.stagger-children > *:nth-child(6) { animation-delay: 0.30s; }
.stagger-children > *:nth-child(7) { animation-delay: 0.36s; }
.stagger-children > *:nth-child(8) { animation-delay: 0.42s; }
```

> Aplicado na `<nav>` da Sidebar e nos blocos do hero do Login.

### 8.5. Framer Motion

Padrões recorrentes (Toast, PermissionGate, Sidebar):

```jsx
// Pop com slide
initial={{ opacity: 0, y: 12, scale: 0.96 }}
animate={{ opacity: 1, y: 0,  scale: 1 }}
transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}

// Slide horizontal (toast)
initial={{ opacity: 0, x: 40, scale: 0.96 }}
animate={{ opacity: 1, x: 0,  scale: 1 }}
exit={{    opacity: 0, x: 40, scale: 0.96 }}
transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
```

### 8.6. Transições de estado

```css
/* Padrão de botão */
transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
            box-shadow 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);

/* Padrão de hover de card */
transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1);

/* Padrão de input */
transition: all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
```

---

## 9. Componentes

### 9.1. Botões

#### `.btn-primary` (CTA principal — verde)

```css
.btn-primary {
  position: relative;
  overflow: hidden;
  font-weight: 700;
  background: #37B24D;
  color: white;
  box-shadow: 0 4px 20px rgba(55, 178, 77, 0.25);
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              box-shadow 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              background 0.2s ease;
}
.btn-primary:hover  { transform: scale(1.02); background: #2F9E44;
                      box-shadow: 0 8px 32px rgba(55, 178, 77, 0.35); }
.btn-primary:active { transform: scale(0.98); transition-duration: 0.1s; }
```

```jsx
<button className="btn-primary rounded-2xl px-6 py-3 text-sm">
  Analisar vídeo
</button>
```

#### `.btn-white` (CTA secundário forte — branco em fundo escuro)

```jsx
<button className="w-full py-4 btn-white rounded-2xl flex justify-center
                   items-center gap-2.5 text-sm
                   disabled:opacity-50 disabled:pointer-events-none">
  <LogIn size={18} strokeWidth={2.5} />
  Entrar no Hub
</button>
```

CSS:
```css
.btn-white { background: white; color: #08080A; font-weight: 700;
             box-shadow: 0 4px 20px rgba(255, 255, 255, 0.10); }
.btn-white:hover  { transform: scale(1.02);
                    box-shadow: 0 8px 32px rgba(255, 255, 255, 0.15); }
.btn-white:active { transform: scale(0.98); }
```

#### `.btn-ghost` (link/ação terciária)

```css
.btn-ghost { font-weight: 500; color: #6b7280;
             transition: color 0.25s ease,
                         transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
.btn-ghost:hover { color: white; transform: translateY(-1px); }
```

```jsx
<button className="btn-ghost text-sm">Cancelar</button>
```

#### `.btn-magnetic` (modificador comportamental)

Adiciona micro-feedback de scale a qualquer botão. Pode combinar com primary/white.

```css
.btn-magnetic { font-weight: 600; transition: transform/box-shadow 0.3s ease-out-quart; }
.btn-magnetic:hover  { transform: scale(1.02); }
.btn-magnetic:active { transform: scale(0.98); transition-duration: 0.1s; }
```

#### Icon button discreto (padrão recorrente)

```jsx
<button className="p-3 bg-white/5 hover:bg-white/8 rounded-2xl
                   transition-colors text-gray-400 hover:text-white">
  <X size={18} strokeWidth={2.5} />
</button>
```

#### Estado disabled (qualquer btn)

```
disabled:opacity-50 disabled:pointer-events-none
```

#### Estado loading (qualquer btn)

```jsx
{loading
  ? <Loader2 size={18} strokeWidth={2.5} className="animate-spin" />
  : <Icon size={18} strokeWidth={2.5} />}
```

---

### 9.2. Inputs

#### `.input-field` (padrão)

```css
.input-field {
  width: 100%;
  background: #18181D;
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: white;
  font-size: 0.875rem;
  font-weight: 400;
  outline: none;
  transition: all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.input-field:focus {
  box-shadow: 0 0 0 2px rgba(55, 178, 77, 0.3);
  border-color: rgba(55, 178, 77, 0.4);
}
.input-field::placeholder { color: #6b7280; font-weight: 400; }
```

#### Input com ícone à esquerda (padrão Login)

```jsx
<div className="space-y-2">
  <label className="text-[10px] font-bold text-gray-400 ml-1
                    tracking-[0.1em] uppercase">Email</label>
  <div className="relative group">
    <Mail size={16} strokeWidth={1.5}
          className="absolute left-4 top-1/2 -translate-y-1/2
                     text-gray-600 group-focus-within:text-primary
                     transition-colors" />
    <input
      type="email"
      required
      className="input-field rounded-2xl p-4 pl-12"
      placeholder="seu@email.com"
    />
  </div>
</div>
```

#### Input pequeno (sidebar)

```jsx
<input
  className="w-full bg-white/[0.04] border border-white/[0.08]
             rounded-xl pl-9 pr-3 py-2 text-[13px] text-white
             placeholder-gray-600 outline-none
             focus:border-primary/30"
  placeholder="email@exemplo.com"
/>
```

#### Erro (inline)

```jsx
<div className="p-4 bg-red-500/8 border border-red-500/15 text-red-400
                rounded-2xl text-sm font-medium flex items-center gap-2.5
                animate-fade-in">
  <AlertCircle size={16} strokeWidth={2} />
  Mensagem de erro.
</div>
```

---

### 9.3. Cards

#### Card padrão (`.glass` — clicável)

```jsx
<div className="glass lift rounded-3xl p-5 transition-all cursor-pointer
                relative overflow-hidden group hover:border-border-hover">
  ...
</div>
```

#### Card selecionado / ativo

```jsx
className="glass lift rounded-3xl p-5 ... border-primary/40 glow-primary
           bg-primary/[0.06]"
```

#### Card destacado (`.glass-raised` — hero/modal interno)

```jsx
<div className="glass-raised rounded-4xl p-9 relative">
  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px
                  bg-gradient-to-r from-transparent via-primary/30
                  to-transparent" />
  ...
</div>
```

#### Card com header de ícone (padrão modal)

```jsx
<div className="p-3 bg-primary/12 rounded-2xl border border-primary/15">
  <Library size={20} strokeWidth={1.5} className="text-primary" />
</div>
```

---

### 9.4. Modais (padrão — não há componente)

```jsx
{open && (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center p-6
               backdrop-blur-md bg-black/50 animate-fade-in"
    onClick={onClose}
  >
    <div
      className="glass-raised w-full max-w-5xl h-[85vh] rounded-4xl
                 flex flex-col relative overflow-hidden shadow-modal"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="p-7 border-b border-border-subtle flex justify-between
                      items-center bg-surface/60">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/12 rounded-2xl border border-primary/15">
            <Icon size={20} strokeWidth={1.5} className="text-primary" />
          </div>
          <h3 className="text-xl font-extrabold text-white tracking-tight">
            Título
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-3 bg-white/5 hover:bg-white/8 rounded-2xl
                     transition-colors text-gray-400 hover:text-white"
        >
          <X size={18} strokeWidth={2.5} />
        </button>
      </div>

      {/* Body */}
      <div className="p-8 overflow-y-auto custom-scrollbar flex-1
                      bg-background/40">
        {children}
      </div>
    </div>
  </div>
)}
```

> **Tamanhos canônicos**: `max-w-3xl` (formulário), `max-w-4xl` (leitor),
> `max-w-5xl` (editor). Altura `h-[85vh]` ou `max-h-[88vh]`.

---

### 9.5. Dropdowns / Popovers

```jsx
{open && (
  <div className="absolute top-full right-0 mt-2 z-50 glass-raised
                  rounded-xl py-1.5 min-w-[150px] animate-fade-in shadow-modal">
    <button className="w-full text-left px-3 py-2 text-[13px] text-gray-300
                       hover:bg-white/[0.06] hover:text-white
                       transition-colors">
      Opção 1
    </button>
    <button className="w-full text-left px-3 py-2 text-[13px] text-red-400
                       hover:bg-red-500/10 hover:text-red-300
                       transition-colors flex items-center gap-2">
      <Trash2 size={13} /> Excluir
    </button>
  </div>
)}
```

> Padrão hardcoded em `ContentGenerator`/`IdeaGenerator` usa
> `bg-[#16161a] border border-white/[0.08] shadow-[0_16px_48px_rgba(0,0,0,0.5)]`
> em vez de `glass-raised` — visualmente equivalente.

---

### 9.6. Tabs (`.tab-group` + `.tab-item`)

```css
.tab-group {
  display: flex; gap: 4px; padding: 4px;
  background: #18181D;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.tab-item {
  padding: 8px 20px; flex: 1;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  font-size: 0.875rem; font-weight: 600;
  transition: all 0.2s ease; cursor: pointer;
}
.tab-item.active {
  background: #37B24D; color: white;
  box-shadow: 0 4px 16px rgba(55, 178, 77, 0.25);
}
.tab-item:not(.active)        { color: #6b7280; }
.tab-item:not(.active):hover  { color: #d1d5db; }
```

```jsx
<div className="tab-group rounded-2xl mb-8 w-full max-w-[280px]">
  <button className={`tab-item rounded-xl ${active === 'a' ? 'active' : ''}`}>
    <Activity size={14} strokeWidth={1.5} /> Status
  </button>
  <button className={`tab-item rounded-xl ${active === 'b' ? 'active' : ''}`}>
    <Terminal size={14} strokeWidth={1.5} /> Log
  </button>
</div>
```

---

### 9.7. Badges / Chips / Pills

```jsx
{/* Badge mono (NOVO, BETA…) */}
<span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase
                 tracking-wider border font-mono
                 bg-white/[0.04] border-white/8 text-white/60">
  Novo
</span>

{/* Chip cinza arredondado */}
<span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg
                 bg-white/[0.08] text-[12px] font-semibold text-gray-300
                 whitespace-nowrap select-none shrink-0">
  thumbnail.mp4
</span>

{/* Color picker swatch */}
<button className="w-6 h-6 rounded-full border-2 transition-transform
                   border-transparent hover:scale-110"
        style={{ background: '#22c55e' }} />

{/* Status pulse */}
<div className="flex items-center gap-2.5 text-gray-600">
  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
  <span className="font-mono text-[10px] tracking-widest uppercase">
    Sistema Operacional
  </span>
</div>
```

---

### 9.8. Toast / Notifications

Componente real em `web-app/src/components/Toast.jsx` (renderizado via portal
no canto superior direito).

```jsx
const VARIANT_STYLES = {
  success: { accent: '#37B24D', glow: '0 0 28px rgba(55, 178, 77, 0.25)',
             icon: CheckCircle2, iconColor: '#7fdc91' },
  error:   { accent: '#E2272F', glow: '0 0 28px rgba(226, 39, 47, 0.25)',
             icon: AlertCircle,  iconColor: '#ff6b72' },
  info:    { accent: '#2F6FEB', glow: '0 0 28px rgba(47, 111, 235, 0.25)',
             icon: Info,         iconColor: '#6b9bff' },
};

<motion.div
  layout
  initial={{ opacity: 0, x: 40, scale: 0.96 }}
  animate={{ opacity: 1, x: 0,  scale: 1 }}
  exit={{    opacity: 0, x: 40, scale: 0.96 }}
  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
  className="pointer-events-auto flex items-start gap-3 pl-4 pr-3 py-3.5
             min-w-[280px] max-w-[380px] relative overflow-hidden"
  style={{
    background: '#1A1A1A',
    border: '1px solid #2A2A2A',
    borderRadius: '12px',
    boxShadow: `0 20px 48px rgba(0,0,0,0.55), ${variant.glow}`,
  }}
  role="status" aria-live="polite"
>
  <div className="absolute left-0 top-0 bottom-0 w-1"
       style={{ background: variant.accent }} />
  <Icon size={17} strokeWidth={2.2}
        style={{ color: variant.iconColor }}
        className="shrink-0 mt-0.5 ml-1" />
  <div className="flex-1 min-w-0">
    {title   && <p className="text-[13px] font-bold text-white leading-tight">
                  {title}</p>}
    {message && <p className="text-[12px] leading-snug mt-1"
                   style={{ color: '#A0A0A0' }}>{message}</p>}
  </div>
  <button className="shrink-0 p-1 rounded-md text-gray-500
                     hover:text-white hover:bg-white/[0.06] transition-colors">
    <X size={13} strokeWidth={2.5} />
  </button>
</motion.div>
```

Container (portal):
```jsx
<div className="fixed top-6 right-6 z-[130] flex flex-col gap-3
                pointer-events-none">
  <AnimatePresence>{toasts.map(...)}</AnimatePresence>
</div>
```

---

### 9.9. Sidebar items

Menu label:
```jsx
{!collapsed && <p className="data-label px-3 mb-4">Menu</p>}
```

Item de navegação (NavLink):
```jsx
<NavLink to="/path"
  className={({ isActive }) => cn(
    "flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium",
    "transition-all duration-200",
    isActive
      ? "bg-primary/12 text-white border border-primary/15"
      : "text-gray-400 hover:text-white hover:bg-white/[0.04]"
  )}
>
  <Icon size={15} strokeWidth={1.8} />
  <span>Label</span>
</NavLink>
```

Sidebar wrapper:
```jsx
<aside className={cn(
  "h-screen bg-surface/80 backdrop-blur-xl border-r border-border-subtle",
  "flex flex-col fixed left-0 top-0 z-[60]",
  "transition-all duration-300 ease-in-out",
  collapsed ? "w-[72px]" : "w-[260px]"
)}>
```

Submenu collapse animado (Framer Motion AnimatePresence + `motion.div`).

---

### 9.10. Empty States / Acesso restrito

```jsx
// PermissionGate denied
<div className="flex items-center justify-center h-full min-h-screen">
  <motion.div
    initial={{ opacity: 0, y: 12, scale: 0.96 }}
    animate={{ opacity: 1, y: 0,  scale: 1 }}
    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    className="text-center"
  >
    <div className="inline-flex items-center justify-center w-16 h-16
                    bg-red-500/10 rounded-3xl mb-5
                    border border-red-500/15">
      <Lock size={26} strokeWidth={1.5} className="text-red-400" />
    </div>
    <h3 className="text-xl font-extrabold text-white tracking-tight mb-2">
      Acesso restrito
    </h3>
    <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs mx-auto">
      Você não tem acesso a este módulo neste workspace.
      Peça ao administrador para liberar.
    </p>
  </motion.div>
</div>
```

```jsx
// Empty content card
<p className="text-gray-600 text-sm font-serif italic text-center py-12">
  Este card não possui conteúdo.
</p>
```

---

### 9.11. Loading / Skeleton

```jsx
{/* Spinner inline */}
<Loader2 size={20} className="animate-spin text-gray-500" />

{/* Métrica em loading */}
<div className="flex flex-col items-center gap-3">
  <Loader2 size={28} className="animate-spin text-primary" />
  <p className="text-gray-600 text-sm animate-pulse font-mono tracking-wide">
    Sincronizando acervo...
  </p>
</div>

{/* Skeleton card */}
<div
  className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5
             animate-pulse flex flex-col gap-2.5"
  style={{ animationDelay: `${i * 40}ms` }}
>
  <div className="h-3 w-2/3 bg-white/10 rounded" />
  <div className="h-3 w-1/2 bg-white/10 rounded" />
</div>

{/* Loading spinner brand (App.jsx) */}
<div className="w-6 h-6 rounded-full border-2 border-white/10
                border-t-primary animate-spin" />
```

---

### 9.12. Scrollbars

```css
/* Global (body) */
::-webkit-scrollbar           { width: 6px; height: 6px; }
::-webkit-scrollbar-track     { background: transparent; }
::-webkit-scrollbar-thumb     { background: rgba(255,255,255,0.08);
                                border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }

/* Mais discreto (.custom-scrollbar) */
.custom-scrollbar::-webkit-scrollbar           { width: 4px; height: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb     { background: rgba(255,255,255,0.06);
                                                 border-radius: 999px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.12); }
```

---

### 9.13. Toggle switch (encontrado em Transcriber)

```jsx
<div className="relative w-[72px] h-[30px] bg-[#18181D] rounded-full
                border border-white/[0.06] flex items-center px-[3px]
                cursor-pointer select-none">
  <div className="w-[22px] h-[22px] rounded-full bg-primary
                  shadow-[0_0_10px_rgba(55,178,77,0.4)]
                  transition-all duration-200 ease-out" />
</div>
```

---

## 10. Layouts Padrão

### 10.1. Estrutura geral

```
<body>                  ← bg-background + noise overlay
  <Sidebar fixed />     ← w-[260px] (ou 72px collapsed)
  <main>                ← ml-[260px] (compensa a sidebar)
    <PageWrapper />
  </main>
</body>
```

### 10.2. Container de página

```jsx
<div className="max-w-4xl mx-auto pt-16 px-8 relative z-10">
  <h2 className="text-4xl font-extrabold text-white tracking-tight">
    Título
  </h2>
  <p className="text-gray-500 mt-2">Subtítulo opcional.</p>
  ...
</div>
```

### 10.3. Modais (max-widths canônicos)

| Conteúdo | max-w |
|---|---|
| Confirm/dialog curto | `max-w-md` (~28rem) |
| Formulário | `max-w-3xl` |
| Leitor de markdown | `max-w-4xl` |
| Editor / lista | `max-w-5xl` |

### 10.4. Grids comuns

```
grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4   (cards de análise)
grid grid-cols-2 md:grid-cols-4 gap-3                  (color picker)
grid grid-cols-7 gap-2                                  (calendário)
```

### 10.5. Breakpoints

Tailwind padrão:
- `sm:` 640px
- `md:` 768px
- `lg:` 1024px (uso recorrente — `text-2xl lg:text-3xl`)
- `xl:` 1280px

A app é **desktop-first**. Mobile pega só pelas regras default (sidebar
colapsa, modais ficam fullscreen).

---

## 11. Iconografia

### 11.1. Biblioteca

**`lucide-react@^1.7.0`** — exclusiva. Não há outra biblioteca de ícones.

```bash
npm install lucide-react
```

### 11.2. Tamanhos canônicos (frequência real)

| Tamanho | Frequência | Quando |
|---|---|---|
| `size={13}` | alta | Ícones inline em texto pequeno (dropdown, badge). |
| `size={14}` | **mais alta** | Sidebar, botões compactos, tab items. |
| `size={15}` | alta | NavLink da sidebar. |
| `size={16}` | alta | Inputs com ícone, botões padrão. |
| `size={18}` | média | Botões com ícone único, modal close. |
| `size={20}` | média | Loaders, ícones de seção. |
| `size={24}` | baixa | Hero brand icon. |
| `size={28}` `size={32}` | rara | Loaders centralizados, vazios. |

### 11.3. Stroke width

| Valor | Frequência | Uso |
|---|---|---|
| `strokeWidth={2.5}` | **mais alta** (114) | Botões, ícones em CTAs, X de fechar. |
| `strokeWidth={1.5}` | alta (92) | Ícones em cards, sidebar items, hero icons. |
| `strokeWidth={2}` | média (54) | Inline em texto. |
| `strokeWidth={1.8}` | média (17) | NavLink da sidebar. |
| `strokeWidth={1.2}` | rara | Ícones decorativos delicados. |

> **Regra**: ícones interativos = 2.5; ícones decorativos/de info = 1.5.

### 11.4. Ícones efetivamente usados (extraídos dos imports)

```
TrendingUp · Sparkles · Layout · LogOut · Settings · PanelLeftClose
PanelLeftOpen · ChevronDown · ChevronLeft · ChevronRight · Zap · Film
Clapperboard · FolderKanban · Plus · BookOpen · Lightbulb · User · Users
Check · X · Trash2 · Mail · Shield · Loader2 · Lock · LogIn · UserPlus
AlertCircle · CheckCircle2 · Info · AlertTriangle · ZoomIn · ZoomOut
RotateCcw · Pencil · Calendar · CalendarDays · Columns3 · Search
ArrowLeft · Library · Activity · Terminal · Download
```

---

## 12. Microinterações

### 12.1. Hover de botão

- `.btn-primary` / `.btn-white`: `scale(1.02)` + glow expande de
  `0 4px 20px` para `0 8px 32px`.
- `.btn-ghost`: `translateY(-1px)` + cor passa de `#6b7280` para `white`.
- Icon button discreto: fundo de `bg-white/5` → `bg-white/8`, cor
  `text-gray-400` → `text-white`.

### 12.2. Active (clique)

- Botões magnéticos: `scale(0.98)` com transição de `0.1s` (snap).

### 12.3. Hover de card (`.lift`)

```css
.lift:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3),
              0 0 24px rgba(55, 178, 77, 0.08);
}
```

### 12.4. Foco de input

Anel verde 2px + borda verde:
```
box-shadow: 0 0 0 2px rgba(55, 178, 77, 0.3);
border-color: rgba(55, 178, 77, 0.4);
```

Bonus: ícone à esquerda muda cor com `group-focus-within:text-primary`.

### 12.5. Stagger de listas

`.stagger-children` aplica `fadeUp 0.4s` com delays de 60ms entre filhos.

### 12.6. Transição de página

Não há transições de rota globais via Framer Motion. Cada página entra com
`animate-fade-up` no container raiz.

### 12.7. Pulse decorativo

Status dot ativo:
```jsx
<div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
```

ou (mais lento, custom):
```jsx
<div className="... animate-glow-pulse" />
```

---

## 13. Padrões de Texto (UI Writing)

### 13.1. Idioma

- **Interface 100% pt-BR.**
- **Código, variáveis, commits, comentários: inglês.**

### 13.2. Caixa alta de metadados

Sempre IBM Plex Mono, 10px, uppercase, `tracking-[0.15em]` ou `tracking-widest`,
`font-weight: 600`, cor `text-gray-400` ou `text-gray-600`:

```jsx
<p className="data-label">MEMBROS (4)</p>
<span className="font-mono text-[10px] tracking-widest uppercase">
  Sistema Operacional
</span>
```

### 13.3. Tom da comunicação

**Ousado, performativo, levemente reverente.** Frases curtas com peso:

- "O epicentro da sua criação viral" (subtítulo Login, font-serif italic)
- "Junte-se à elite da criação viral" (subtítulo Register)
- "Entrar no Hub" (CTA Login)
- "Sistema Operacional" (status discreto)
- "Vídeos Longos" / "Meus Projetos" (h2 funcional)
- "Acesso restrito" (denied screen)

Estados vazios usam **serif itálico**, em tom resignado/poético:
- "Nenhum conteúdo ainda..."
- "Este card não possui conteúdo."

### 13.4. Botões

Verbo direto, sem ponto final:
- "Entrar no Hub", "Crie sua conta", "Convidar", "Excluir", "Cancelar",
  "Analisar vídeo", "Adicionar projeto", "Ajustar", "Roteirizar".

---

## 14. Do's and Don'ts

### ❌ Don'ts

- **NÃO usar fontes proibidas**: Inter, Roboto, Arial, Open Sans, Lato,
  system fonts. (Regra do `CLAUDE.md`.)
- **NÃO usar paletas roxas/azuis em fundo branco** ou qualquer fundo claro.
  A app é dark-only.
- **NÃO usar gradientes em fundos sólidos** de página. Gradientes só em
  separadores 1px e blobs ambient.
- **NÃO usar border-radius uniforme** em todos os elementos. Botão = 2xl,
  card = 3xl, modal = 4xl.
- **NÃO usar pesos médios (400/500 vs 600)** pra criar hierarquia. Use
  extremos (400 vs 800).
- **NÃO substituir IBM Plex Mono** em labels de metadados por sans uppercase.
- **NÃO inventar shadows** — sempre usar `shadow-card` / `shadow-card-hover`
  / `shadow-modal` / `glow-*`.
- **NÃO esquecer o noise overlay** — é o que dá o "premium".
- **NÃO usar cores de marca fora da paleta**. Verde primary é o único
  "destaque". Vermelho/azul/amarelo = semânticos (erro/info/aviso).

### ✅ Do's

- **Use `.glass` ou `.glass-raised`** em cards e modais — backdrop blur 40px.
- **Combine `font-serif italic` em frases curtas** decorativas — nunca em
  parágrafos longos.
- **Use `.data-label` (IBM Plex Mono uppercase)** pra qualquer label de
  agrupamento ou metadado.
- **Use `cubic-bezier(0.16, 1, 0.3, 1)`** (ease-out-expo) em micro-interações.
- **Use `Loader2` da lucide-react com `animate-spin`** pra todo loading inline.
- **Padronize ícones em 14-16px com strokeWidth 1.5 (decorativo) ou 2.5
  (interativo).**
- **Sempre componha shadow + glow** em CTAs primários (`box-shadow:
  0 4px 20px rgba(55, 178, 77, 0.25)`).

---

## 15. Prompt Pronto pra IA

> Copie e cole o bloco abaixo como instrução de sistema em qualquer outra IA
> (Lovable, Bolt, v0, Claude Code, ChatGPT) que precise replicar a identidade
> visual do ViralHub.

```text
Você está construindo uma interface com a identidade visual do ViralHub.

ESTÉTICA: dark premium com glassmorphismo intenso. Fundo principal #08080A
(quase preto). Surfaces #111114 / #18181D / #1F1F26. Cor de marca verde
esmeralda #37B24D (hover #2F9E44, accent claro #69DB7C). Bordas sempre
rgba(255,255,255,0.06) ou /0.08. Acentos semânticos: erro #E2272F, info
#2F6FEB, aviso amber-500. Não use roxo, não use gradientes em fundos sólidos
de página, não use cores fora desta paleta.

TIPOGRAFIA (3 famílias do Google Fonts, importadas via:
https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300..1,800&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap):
- Plus Jakarta Sans (300-800) → toda a UI, títulos, corpo, botões.
  Use extremos de peso: 400 (corpo) vs 800 (títulos). Letter-spacing
  -0.01em no body, -0.025em em h1.
- Instrument Serif (regular + itálico) → APENAS taglines decorativas
  curtas em "font-serif italic" (subtítulos de hero, estados vazios).
- IBM Plex Mono (300-600) → labels de metadados em uppercase, métricas
  numéricas, código inline. SEMPRE 10px / uppercase / tracking 0.15em /
  weight 600 / cor #6B7280.

NUNCA use Inter, Roboto, Arial, Open Sans, Lato, ou system fonts.

BORDER-RADIUS: nunca uniforme. Botões = 16px (rounded-2xl). Cards de
conteúdo = 24px (rounded-3xl). Modais grandes e hero cards = 32px
(rounded-4xl). Status dots e color pickers = rounded-full.

SHADOWS:
- Botão primary: 0 4px 20px rgba(55,178,77,0.25), hover vira
  0 8px 32px rgba(55,178,77,0.35).
- Card padrão: 0 8px 32px rgba(0,0,0,0.4) + inset 0 1px 0 rgba(255,255,255,0.04).
- Modal: 0 32px 80px rgba(0,0,0,0.6) (token shadow-modal).
- Hover de card lift: translateY(-2px) + 0 12px 40px rgba(0,0,0,0.3) +
  0 0 24px rgba(55,178,77,0.08).

GLASSMORPHISMO: aplique em todo card e modal:
  background: rgba(17,17,20,0.6) (ou rgba(24,24,29,0.7) para "raised");
  backdrop-filter: blur(40px) saturate(1.2);
  border: 1px solid rgba(255,255,255,0.06);

NOISE OVERLAY (obrigatório, sempre presente): inclua um SVG inline com
filter feTurbulence baseFrequency=0.80 numOctaves=4, e aplique via body::before
com filter:url(#noise), opacity 0.04, mix-blend-mode overlay, position fixed
inset 0, z-index 9999, pointer-events none.

ANIMAÇÕES: use cubic-bezier(0.16, 1, 0.3, 1) em micro-interações (ease-out-expo)
e cubic-bezier(0.25, 0.46, 0.45, 0.94) em transições maiores. Stagger de
filhos com delay de 60ms (até 0.42s no 8º filho). Hover de botão = scale(1.02),
active = scale(0.98) com transition-duration 0.1s. Page entry = fadeUp 0.6s.

ICONOGRAFIA: use exclusivamente lucide-react. Tamanhos canônicos: 14-16px
para uso geral. strokeWidth 1.5 para ícones decorativos, 2.5 para ícones
em CTAs e botões close. NUNCA misture lucide com outras bibliotecas
(Heroicons, Feather, etc.).

COMPONENTES BASE (classes utilitárias canônicas):
- .btn-primary: bg #37B24D, color white, font-weight 700, border-radius 16px,
  shadow do CTA (acima), hover scale(1.02) + bg #2F9E44.
- .btn-white: bg white, color #08080A, font-weight 700, border-radius 16px.
- .btn-ghost: color #6B7280, hover color white + translateY(-1px).
- .input-field: bg #18181D, border 1px rgba(255,255,255,0.06), border-radius
  16px, padding 16px (com ícone à esquerda use pl-12). Focus = box-shadow
  0 0 0 2px rgba(55,178,77,0.3) + border-color rgba(55,178,77,0.4).
- Tab switcher: container bg #18181D padding 4px gap 4px; item ativo
  bg #37B24D + shadow 0 4px 16px rgba(55,178,77,0.25).
- Modal: overlay bg-black/50 + backdrop-blur-md, conteúdo glass-raised
  rounded-4xl shadow-modal max-w-5xl h-[85vh].
- Toast (top-right portal): bg #1A1A1A, border #2A2A2A, border-radius 12px,
  rail vertical de 4px na cor da variante (success/error/info), framer-motion
  slide horizontal 40px.
- Sidebar: w-[260px] (ou 72px collapsed), bg-surface/80 backdrop-blur-xl,
  border-r border-subtle. Item ativo: bg-primary/12 border-primary/15.

UI WRITING: 100% pt-BR. Tom ousado e direto ("Entrar no Hub", "O epicentro
da sua criação viral"). Estados vazios em font-serif italic ("Nenhum conteúdo
ainda..."). Labels de metadados em IBM Plex Mono 10px uppercase tracking 0.15em.

GRADE DE LAYOUT: container .max-w-4xl mx-auto pt-16 px-8. Modais max-w-3xl
(form), max-w-4xl (leitor), max-w-5xl (editor).

Siga estritamente essa identidade. Se em dúvida sobre um valor, escolha
o mais próximo da paleta/escala documentada — nunca invente um novo token.
```

---

## 16. Inconsistências Encontradas

> Estas notas são **observações**, não correções aplicadas. Reportadas
> conforme regra do briefing.

1. **Toast com cores hardcoded fora dos tokens.** `Toast.jsx` usa
   `#1A1A1A`, `#2A2A2A`, `#E2272F`, `#2F6FEB` inline. Sugestão: registrar
   `toast-bg` (`#1A1A1A`), `toast-border` (`#2A2A2A`), `error` (`#E2272F`),
   `info` (`#2F6FEB`) em `tailwind.config.js`.

2. **`accent-muted` token nunca é usado** como classe `bg-accent-muted`.
   Em vez disso, o código usa `bg-primary/8` ou `bg-primary/10`. Decidir:
   adotar `bg-accent-muted` ou remover o token.

3. **Variantes de transparência de `red-500` divergem** entre telas:
   `red-500/8`, `/10`, `/12`, `/15`, `/20`, `/25`. Sugestão: padronizar
   o "destrutivo" em `bg-red-500/10 border-red-500/20`.

4. **Dropdowns hardcoded em `ContentGenerator.jsx` e `IdeaGenerator.jsx`**
   (`bg-[#16161a] border-white/[0.08] shadow-[0_16px_48px_rgba(0,0,0,0.5)]`)
   reimplementam visualmente o `glass-raised rounded-xl shadow-modal` usado
   no resto. Sugestão: substituir por `glass-raised`.

5. **`primary-glow` (rgba 0.12)** definido no Tailwind — código repete
   `bg-primary/8`, `/10`, `/12` à mão sem usar a classe. Decidir: adotar
   `bg-primary-glow` consistentemente, ou remover o token.

6. **Hero h1 inconsistente**: Login/Register usam `text-3xl font-extrabold`,
   páginas internas usam `text-4xl font-extrabold`. Provavelmente proposital
   (auth = mais íntimo), mas vale documentar a regra explicitamente em vez
   de deixar implícita.

7. **`border-white/8` (sintaxe Tailwind 4 sem brackets) vs `border-white/[0.08]`**
   (com brackets) — coexistem. Padronizar em uma forma.

8. **PROIBIDA mas presente**: `web-app/src/index.css` linha 613 define
   `.notion-editor` com `font-family: -apple-system, BlinkMacSystemFont,
   "Segoe UI", Roboto, sans-serif;` — isso lista **Roboto e system fonts**
   apesar do CLAUDE.md proibir explicitamente. Considerar trocar para Plus
   Jakarta Sans.

9. **Sidebar usa `text-[12px]` `text-[13px]`** com brackets em vez dos
   tokens Tailwind (`text-xs`, `text-sm`). Funciona, mas vale escolher
   uma convenção.

---

**Última atualização:** 2026-04-18 — extração inicial automática a partir do
estado atual do código (`main` @ `1f2f6f5`).
