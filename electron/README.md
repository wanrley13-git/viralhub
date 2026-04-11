# ViralHub Desktop (Mac)

App Electron que empacota o ViralHub como aplicativo nativo para macOS.  
O frontend é carregado diretamente da URL de produção no Vercel — requer conexão com internet.

## Pré-requisitos

- Node.js 18+

## Desenvolvimento

```bash
cd electron
npm install
npm start
```

## Gerar o .dmg para distribuição

```bash
cd electron
npm run build
```

O arquivo `.dmg` será gerado em `electron/dist/`.

## Ícone do app

O ícone em `build/icon.icns` é um placeholder PNG.  
Para gerar o `.icns` correto a partir do SVG:

```bash
# 1. Instalar dependências
brew install librsvg

# 2. Gerar PNGs em múltiplas resoluções
mkdir -p icon.iconset
for size in 16 32 64 128 256 512; do
  rsvg-convert -w $size -h $size ../web-app/public/icons/icon-512.svg > icon.iconset/icon_${size}x${size}.png
  double=$((size * 2))
  rsvg-convert -w $double -h $double ../web-app/public/icons/icon-512.svg > icon.iconset/icon_${size}x${size}@2x.png
done

# 3. Converter para .icns
iconutil -c icns icon.iconset -o build/icon.icns

# 4. Limpar
rm -rf icon.iconset
```
