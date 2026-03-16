# ⬡ Cotizador de Importación Perú — VPS Deploy

## Arquitectura

```
Internet
   │
   ▼
Nginx (80/443 + SSL)
   │
   ▼
Node.js (Express, puerto 3000)
   ├── /api/nandina         → 8,017 partidas en memoria (auto-actualizable)
   ├── /api/tc              → Tipo de cambio SUNAT (cache 1h)
   ├── /api/monedas         → Multi-moneda (cache 1h)
   ├── /api/sunat/:hs       → Proxy a Aduanet (evita CORS)
   ├── /api/ai/classify     → Proxy a Groq/OpenAI (keys en server)
   ├── /api/ai/extract      → Extracción de documentos con IA
   ├── /api/quotations      → CRUD cotizaciones (SQLite)
   ├── /api/products        → CRUD productos frecuentes (SQLite)
   ├── /api/changelog       → Log de cambios detectados
   ├── CRON (lunes 3am)     → Verifica actualizaciones en Aduanet
   └── /* (frontend)        → React SPA
```

## Requisitos

- VPS con Ubuntu 20.04+ (1GB RAM mínimo)
- Dominio apuntando al VPS (para SSL)
- API key de Groq (gratis en groq.com) — opcional pero recomendado

## Deploy (5 minutos)

### 1. Subir archivos al VPS

```bash
# Desde tu máquina local
scp -r cotizador-peru-vps/ user@tu-vps-ip:/home/user/cotizador-peru/
```

### 2. Setup automático

```bash
ssh user@tu-vps-ip
cd /home/user/cotizador-peru
chmod +x scripts/setup.sh
./scripts/setup.sh
```

Esto instala: Node.js 20, Nginx, PM2, dependencias npm.

### 3. Configurar

```bash
nano .env
```

Mínimo necesitas:
```
PORT=3000
DOMAIN=cotizador.tudominio.com
GROQ_API_KEY=gsk_tu_key_de_groq    # opcional
```

### 4. Colocar base arancelaria

```bash
# Opción A: Usar el JSON pre-generado
cp /ruta/a/nandina.json data/

# Opción B: Colocar los TXT de Aduanet (el server los procesa solo)
cp NANDINA.TXT NANDTASA.TXT data/
```

### 5. Colocar el frontend

```bash
# Copia el archivo JSX de la app al directorio público
cp /ruta/a/cotizador_peru_v2.jsx client/dist/app.jsx
```

### 6. Iniciar

```bash
pm2 start server/index.js --name cotizador
pm2 save
pm2 startup  # auto-start al reiniciar VPS
```

### 7. SSL (recomendado)

```bash
sudo certbot --nginx -d cotizador.tudominio.com
```

### 8. Verificar

```bash
curl http://localhost:3000/api/nandina/status
# → {"count":8017,"lastUpdate":"2026-03-14...","source":"json"}

curl http://localhost:3000/api/tc
# → {"compra":3.70,"venta":3.75}
```

## Estructura de Archivos

```
cotizador-peru/
├── server/
│   ├── index.js           # Express server principal
│   ├── nandina.js         # Servicio NANDINA (carga, cache, auto-update)
│   ├── sunat-proxy.js     # Proxy TC + consulta partida Aduanet
│   ├── ai-proxy.js        # Proxy IA (Groq/OpenAI, keys en server)
│   └── db.js              # SQLite (cotizaciones, productos, changelog)
│
├── client/
│   └── dist/
│       ├── index.html     # HTML base con React CDN
│       ├── app.jsx        # ← Tu cotizador_peru_v2.jsx va aquí
│       └── api.js         # Adapter para API del backend
│
├── scripts/
│   └── setup.sh           # Setup automático Ubuntu
│
├── data/                   # Generado automáticamente
│   ├── nandina.json       # Base arancelaria (8,017 partidas)
│   └── cotizador.db       # SQLite (cotizaciones, productos)
│
├── .env                   # Configuración (no commitear)
├── .env.example           # Template de configuración
└── package.json
```

## API Endpoints

### Base Arancelaria
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/nandina` | Todas las partidas (con cache en memoria) |
| GET | `/api/nandina/search?q=laptop` | Búsqueda por código o descripción |
| GET | `/api/nandina/lookup/8471300000` | Lookup exacto por código |
| GET | `/api/nandina/status` | Estado: count, lastUpdate, source |

### SUNAT
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/tc` | Tipo de cambio SUNAT USD→PEN |
| GET | `/api/monedas` | Todas las tasas de cambio vs USD |
| GET | `/api/sunat/partida/8471300000` | Scrape de Aduanet (Ad Valorem, IGV, ISC) |

### IA
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/ai/classify` | Clasificación arancelaria con IA |
| POST | `/api/ai/extract` | Extracción de datos de documentos/imágenes |

### Cotizaciones y Productos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET/POST/DELETE | `/api/quotations` | CRUD cotizaciones |
| GET/POST/DELETE | `/api/products` | CRUD productos |
| GET | `/api/changelog` | Log de cambios detectados |

## Auto-actualización

El cron job corre cada lunes a las 3am (configurable en `.env`):

1. Descarga la tabla NANDINA de Aduanet
2. Compara con la versión actual
3. Si hay cambios:
   - Actualiza `data/nandina.json`
   - Registra los cambios en `changelog` (partidas agregadas, tasas modificadas)
   - Los usuarios ven los cambios al recargar la app

Para verificar manualmente:
```bash
node scripts/update-nandina.js
# O via API:
curl http://localhost:3000/api/changelog
```

## Mantenimiento

### Logs
```bash
pm2 logs cotizador         # Ver logs en tiempo real
pm2 logs cotizador --lines 100  # Últimas 100 líneas
```

### Reiniciar
```bash
pm2 restart cotizador
```

### Actualizar la app
```bash
cd /home/user/cotizador-peru
git pull  # si usas git
# O scp los archivos actualizados
pm2 restart cotizador
```

### Backup
```bash
# Base arancelaria + cotizaciones
cp data/nandina.json data/cotizador.db /backup/
```

### Actualización manual de NANDINA
Si el cron no puede descargar automáticamente:
1. Ve a http://www.aduanet.gob.pe/ol-ad-tg/ServletTGConsultaTablas
2. Descarga NANDINA.TXT y NANDTASA.TXT
3. Cópialos a `data/` en el VPS
4. Reinicia: `pm2 restart cotizador`
5. El server los procesa y genera nandina.json automáticamente

## Escalamiento Futuro

| Feature | Cómo implementar |
|---------|-----------------|
| Auth/usuarios | Agregar passport.js + JWT |
| Multi-tenant | Campo user_id en SQLite |
| Notificaciones | Integrar Telegram bot o email cuando el cron detecte cambios |
| Monitoreo El Peruano | Scraper de busquedas.elperuano.pe/normaslegales filtrando "arancel" |
| Analytics | Agregar middleware que logea búsquedas populares |
| CDN propio | Servir nandina.json desde tu dominio para otros developers |
