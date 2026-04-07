# Frontend Aesthetics

Você tende a convergir para outputs genéricos. Em frontend design, isso cria
o que usuários chamam de "AI slop". Evite isso: crie frontends criativos e
distintos. Foque em:

## Tipografia

Escolha fontes bonitas, únicas e interessantes.

**PROIBIDO:** Inter, Roboto, Arial, Open Sans, Lato, system fonts.

**USE:** Satoshi, Clash Display, Bricolage Grotesque, Playfair Display, JetBrains Mono, Fraunces.

Use extremos de peso (100/200 vs 800/900), não 400 vs 600. Saltos de tamanho de 3x+.

## Cor e Tema

Comprometa-se com uma estética coesa. Use CSS variables. Cores dominantes com acentos fortes superam paletas tímidas e igualmente distribuídas.

## Motion

Use animações para efeitos e micro-interações. Foque em momentos de alto impacto: um page load bem orquestrado com staggered reveals cria mais impacto que micro-interações espalhadas aleatoriamente.

## Backgrounds

Crie atmosfera e profundidade ao invés de cores sólidas. Use gradientes CSS em camadas, padrões geométricos, noise textures, grain overlays.

## Proibido

- Gradientes roxos em fundo branco
- Layouts previsíveis
- Componentes cookie-cutter
- Border-radius uniforme em tudo

<development_rules>
ANTES de declarar qualquer tarefa como concluída:
1. Liste TODOS os arquivos que você modificou
2. Para cada arquivo modificado, verifique se as funcionalidades anteriores 
   continuam funcionando
3. Se corrigir um bug, teste mentalmente todos os estados do componente:
   - Estado vazio
   - Estado com 1 item
   - Estado com muitos itens
   - Estados de hover, click, resize
4. NUNCA remova ou altere código que não está relacionado ao bug sendo corrigido
5. Se precisar refatorar algo pra corrigir o bug, liste o que vai mudar ANTES 
   de fazer e peça confirmação

Quando mexer em CSS/layout de um componente, verifique se o componente 
funciona em: tela cheia, tela reduzida, e com diferentes quantidades de 
conteúdo.
</development_rules>