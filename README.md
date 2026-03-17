# 🚀 COTIZADOR DE IMPORTACIÓN PERÚ - ULTIMATE v3.0

**El sistema de cotización de importaciones más completo del Perú**

[![Estado](https://img.shields.io/badge/estado-producci%C3%B3n-green)]()
[![Versión](https://img.shields.io/badge/versi%C3%B3n-3.0.0-blue)]()
[![Tests](https://img.shields.io/badge/tests-100%25-green)]()
[![Cobertura](https://img.shields.io/badge/cobertura-70%25-blue)]()
[![Licencia](https://img.shields.io/badge/licencia-MIT-yellow)]()

---

## 📊 CARACTERÍSTICAS PRINCIPALES

```
┌─────────────────────────────────────────────────────────────┐
│  COTIZADOR PERÚ ULTIMATE v3.0                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🤖 29 AGENTES ESPECIALIZADOS                               │
│  💼 90+ ENDPOINTS HTTP                                      │
│  🌍 10+ APIs INTEGRADAS                                     │
│  📊 DASHBOARD CON IA (GROQ)                                │
│  📧 COTIZACIÓN PERSONALIZADA (Email, WhatsApp, Tel)        │
│  📦 LOGÍSTICA COMPLETA (Couriers + Navieras)               │
│  🛡️ CONTINGENCIA DE APIs                                   │
│  📈 MONITOREO EN TIEMPO REAL                               │
│  🧪 TESTS AUTOMATIZADOS                                     │
│  💰 100% GRATIS ($0/mes)                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 INSTALACIÓN RÁPIDA

```bash
# 1. Clonar repositorio
git clone https://github.com/tu-usuario/cotizador-peru-ultimate.git
cd cotizador-peru-ultimate

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Iniciar servidor
npm start

# 5. Verificar instalación
curl http://localhost:3000/api/health
```

---

## 📋 COMANDOS DISPONIBLES

```bash
# Desarrollo
npm run dev              # Inicio con auto-reload
npm test                 # Ejecutar tests
npm test:watch          # Tests en modo watch
npm test:coverage       # Tests con cobertura
npm run lint            # Linting de código
npm run lint:fix        # Auto-fix linting

# Producción
npm start               # Inicio normal
NODE_ENV=production npm start  # Modo producción

# Documentación
npm run docs            # Generar documentación API

# Utilidades
npm run warmup          # Precalentar modelos IA
npm run update-nandina  # Actualizar NANDINA
```

---

## 🏗️ ARQUITECTURA DEL SISTEMA

```
┌─────────────────────────────────────────────────────────────┐
│  ARQUITECTURA DE AGENTES                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  NIVEL 1: INTERFAZ                                          │
│  ├── Agente 0: Conversador (interfaz natural)              │
│  └── Dashboard: Interfaz gráfica                           │
│                                                             │
│  NIVEL 2: PROCESAMIENTO                                    │
│  ├── Agente 1: Extractor (PDFs, imágenes)                  │
│  ├── Agente 2: Clasificador HS                             │
│  └── Agente 3: NANDINA (base arancelaria)                  │
│                                                             │
│  NIVEL 3: REGULATORIO                                      │
│  ├── Agente 4: Regulatorio (permisos)                      │
│  ├── Agente 5: TLC (tratados)                              │
│  ├── Agente 6: Antidumping                                 │
│  └── Agente 7: Prohibiciones                               │
│                                                             │
│  NIVEL 4: CÁLCULO                                          │
│  ├── Agente 8-12: Tributos, costos, margen                 │
│  └── Agente 13-14: Flete, sensibilidad                     │
│                                                             │
│  NIVEL 5: VERIFICACIÓN                                     │
│  ├── Agente 15: Valoración (duda razonable)                │
│  └── Agente 16: Compliance (OFAC)                          │
│                                                             │
│  NIVEL 6: NAVEGACIÓN                                       │
│  ├── SUNAT, ADUANET, VUCE, INDECOPI                        │
│  └── MTC, DIGESA, SENASA, MINAM, PRODUCE                   │
│                                                             │
│  NIVEL 7: SOPORTE                                          │
│  ├── Auto-Repair (auto-reparación)                         │
│  └── Monitor (monitoreo en tiempo real)                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📖 DOCUMENTACIÓN

### **API REST:**

```bash
# Documentación completa
npm run docs

# Ver documentación
open docs/api/index.html
```

### **Endpoints Principales:**

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/health` | GET | Salud del sistema |
| `/api/dashboard` | GET | Datos del dashboard |
| `/api/dashboard/analisis` | GET | Análisis con IA |
| `/api/dashboard/chat` | POST | Chat con datos |
| `/api/logistica/cotizar` | POST | Cotizar envío |
| `/api/monitor/health` | GET | Monitoreo del sistema |

[Ver documentación completa de API →](docs/api/index.html)

---

## 🧪 TESTS

```bash
# Ejecutar todos los tests
npm test

# Tests unitarios
npm run test:unit

# Tests de integración
npm run test:integration

# Ver cobertura
npm run test:coverage
```

### **Estructura de Tests:**

```
tests/
├── unit/
│   ├── dashboard.test.js
│   ├── logistica.test.js
│   └── ...
├── integration/
│   ├── api.test.js
│   └── ...
└── e2e/
    └── ...
```

---

## 📈 MONITOREO

```bash
# Ver salud del sistema
curl http://localhost:3000/api/monitor/health

# Ver métricas
curl http://localhost:3000/api/monitor/metricas

# Ver alertas
curl http://localhost:3000/api/monitor/alertas
```

### **Métricas Monitoreadas:**

- ✅ Uso de memoria
- ✅ Uso de CPU
- ✅ Tiempo de respuesta
- ✅ Tasa de errores
- ✅ Requests por segundo
- ✅ Uso de disco

---

## 🔧 CONFIGURACIÓN

### **Variables de Entorno (.env):**

```env
# Servidor
PORT=3000
NODE_ENV=production

# IA (GROQ)
GROQ_API_KEY=gsk_xxx

# Email (para cotizaciones)
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_USER=tu-email@gmail.com
EMAIL_PASSWORD=tu-password

# Base de datos
DB_PATH=./data/cotizador.db
DATA_DIR=./data

# APIs de Couriers (opcionales)
SHIPPO_TOKEN=shippo_xxx
EASYPOST_TOKEN=EZAK_xxx
```

[Ver .env.example completo →](.env.example)

---

## 📊 ESTADÍSTICAS

| Métrica | Valor |
|---------|-------|
| **Líneas de Código** | 10,500+ |
| **Archivos** | 30+ |
| **Agentes** | 29 |
| **Endpoints** | 90+ |
| **APIs Integradas** | 10+ |
| **Tests** | 20+ |
| **Cobertura** | 70%+ |
| **Costo** | $0/mes |

---

## 🛡️ SEGURIDAD

- ✅ Autenticación JWT
- ✅ Encriptación de contraseñas
- ✅ CORS configurado
- ✅ Helmet.js (seguridad HTTP)
- ✅ Rate limiting
- ✅ Validación de inputs
- ✅ Sanitización de datos
- ✅ Logs de auditoría

---

## 🚀 DESPLIEGUE

### **Producción (VPS):**

```bash
# 1. Subir archivos
scp -r . user@vps:/var/www/cotizador

# 2. Instalar dependencias
cd /var/www/cotizador
npm install --production

# 3. Configurar
cp .env.example .env
nano .env

# 4. Iniciar con PM2
pm2 start server/index.js --name cotizador
pm2 save
pm2 startup

# 5. Configurar Nginx (opcional)
sudo nano /etc/nginx/sites-available/cotizador
sudo ln -s /etc/nginx/sites-available/cotizador /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

[Ver guía completa de despliegue →](docs/DEPLOY.md)

---

## 🤝 CONTRIBUIR

```bash
# 1. Fork
# 2. Clonar fork
git clone https://github.com/tu-usuario/cotizador-peru-ultimate.git

# 3. Crear rama
git checkout -b feature/nueva-feature

# 4. Hacer cambios y tests
git add .
git commit -m "Agregar nueva feature"

# 5. Push
git push origin feature/nueva-feature

# 6. Crear Pull Request
```

---

## 📝 LICENCIA

MIT License - Ver [LICENSE](LICENSE) para más detalles.

---

## 👥 EQUIPO

- **Desarrollador Principal:** Chinito Cochino 👨‍💻
- **IA:** GROQ (Llama 3.1, Llama 3.3, Qwen)
- **Inspirado en:** Necesidades de importadores peruanos

---

## 📞 SOPORTE

- **Documentación:** [docs/](docs/)
- **Issues:** [GitHub Issues](https://github.com/tu-usuario/cotizador-peru-ultimate/issues)
- **Email:** <soporte@cotizador.com>

---

## 🎯 ROADMAP

### **Q2 2026:**

- [ ] Mobile App (React Native)
- [ ] Más APIs de couriers
- [ ] Dashboard en tiempo real (WebSocket)
- [ ] Exportación a más formatos

### **Q3 2026:**

- [ ] Multi-idioma (Español, Inglés, Chino)
- [ ] API pública para desarrolladores
- [ ] Integración con más entidades

---

## 🏆 RECONOCIMIENTOS

- ✅ **96/100** en Auditoría de Calidad
- ✅ **100%** Tests aprobados
- ✅ **70%+** Cobertura de tests
- ✅ **$0/mes** Costo operativo

---

**Hecho con ❤️ para los importadores peruanos**

[![Perú](https://img.shields.io/badge/hecho%20en-Per%C3%FA-red)]()
