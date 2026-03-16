# 🚀 DESPLIEGUE AUTOMÁTICO AL VPS

## 📋 REQUISITOS PREVIOS

### EN TU MÁQUINA LOCAL:
- ✅ Git instalado (para scp/rsync)
- ✅ SSH configurado
- ✅ Node.js 18+

### EN EL VPS:
- ✅ Ubuntu 20.04 o superior
- ✅ Acceso root o sudo
- ✅ Puerto 22 (SSH) abierto

---

## 🎯 DESPLIEGUE EN 1 COMANDO

### **EN WINDOWS:**

```bash
deploy-vps.bat
```

### **EN LINUX/MAC:**

```bash
chmod +x deploy-vps.sh
./deploy-vps.sh
```

---

## 📝 QUÉ HACE EL SCRIPT:

```
┌─────────────────────────────────────────────────────────────┐
│  DESPLIEGUE AUTOMÁTICO - 8 PASOS                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [1/8] Preparar paquete local                              │
│    - Limpia node_modules                                   │
│    - Crea .env.production                                  │
│                                                             │
│  [2/8] Subir archivos al VPS                               │
│    - Sube TODO menos node_modules                          │
│    - Usa scp/rsync                                         │
│                                                             │
│  [3/8] Instalar dependencias en VPS                        │
│    - npm install (servidor)                                │
│    - npm install (cliente React)                           │
│                                                             │
│  [4/8] Configurar entorno                                  │
│    - Copia .env.production a .env                          │
│    - Instala PM2                                           │
│                                                             │
│  [5/8] Iniciar servicio                                    │
│    - pm2 start server/index.js                             │
│    - pm2 save                                              │
│    - pm2 startup                                           │
│                                                             │
│  [6/8] Configurar Nginx                                    │
│    - Instala Nginx                                         │
│    - Configura proxy inverso                               │
│    - Configura puertos 3000, 3001, 3002                    │
│                                                             │
│  [7/8] Verificar servicio                                  │
│    - pm2 status                                            │
│    - curl http://localhost:3001/api/monitor/health         │
│    - Verifica puertos                                      │
│                                                             │
│  [8/8] Reporte final                                       │
│    - URLs de acceso                                        │
│    - Comandos útiles                                       │
│    - Próximos pasos                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 CONFIGURACIÓN PERSONALIZADA

### **EDITAR .env.production ANTES DE DESPLEGAR:**

```bash
nano .env.production
```

**CAMBIAR ESTO:**
```env
GROQ_API_KEY=COLOCA_TU_API_KEY_DE_GROQ_AQUI
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_password_de_aplicacion
```

**POR ESTO:**
```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_USER=tu_correo_real@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx  # App password de Gmail
```

---

## 📊 DESPUÉS DEL DESPLIEGUE

### **VERIFICAR QUE TODO FUNCIONE:**

```bash
# 1. Conectarse al VPS
ssh root@107.175.95.172

# 2. Ver estado del servicio
pm2 status

# 3. Ver logs
pm2 logs cotizador --lines 20

# 4. Probar API
curl http://localhost:3001/api/monitor/health

# 5. Ver puertos
netstat -tulpn | grep -E '3000|3001|3002'
```

### **ACCEDER AL DASHBOARD:**

```
http://107.175.95.172
```

---

## 🔧 COMANDOS ÚTILES

### **GESTIONAR EL SERVICIO:**

```bash
# Ver estado
pm2 status

# Ver logs en tiempo real
pm2 logs cotizador

# Reiniciar servicio
pm2 restart cotizador

# Detener servicio
pm2 stop cotizador

# Eliminar servicio
pm2 delete cotizador

# Ver uso de memoria
pm2 monit
```

### **ACTUALIZAR EL CÓDIGO:**

```bash
# En tu local
git pull origin main

# Volver a desplegar
./deploy-vps.sh  # o deploy-vps.bat en Windows
```

### **VER ESTADÍSTICAS:**

```bash
# En el VPS
cd /var/www/cotizador

# Ver membresías
curl http://localhost:3001/api/membresias/estadisticas

# Ver uso del sistema
pm2 monit
```

---

## 🔐 CONFIGURAR SSL (HTTPS)

### **INSTALAR CERTBOT:**

```bash
ssh root@107.175.95.172

# Instalar Certbot
apt-get install -y certbot python3-certbot-nginx

# Obtener certificado
certbot --nginx -d tu-dominio.com
```

### **AUTOMATIZAR RENOVACIÓN:**

```bash
# Agregar al crontab
crontab -e

# Agregar esta línea (renueva automáticamente)
0 3 1 * * certbot renew --quiet
```

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### **ERROR: "Permission denied"**

```bash
# Dar permisos correctos
sudo chown -R $USER:$USER /var/www/cotizador
chmod -R 755 /var/www/cotizador
```

### **ERROR: "Port already in use"**

```bash
# Ver qué está usando el puerto
sudo lsof -i :3001

# Matar el proceso
sudo kill -9 PID
```

### **ERROR: "Cannot find module"**

```bash
cd /var/www/cotizador
npm install
pm2 restart cotizador
```

### **ERROR: Nginx 502 Bad Gateway**

```bash
# Verificar que Node.js está corriendo
pm2 status

# Si no está, iniciar
pm2 start server/index.js --name cotizador
pm2 save

# Recargar Nginx
systemctl reload nginx
```

---

## 📊 ESTADÍSTICAS DE LA COMUNIDAD

### **VER MIEMBROS:**

```bash
curl http://localhost:3001/api/membresias/miembros \
  -H "Authorization: Bearer TOKEN_ADMIN"
```

### **VER ESTADÍSTICAS:**

```bash
curl http://localhost:3001/api/membresias/estadisticas \
  -H "Authorization: Bearer TOKEN_ADMIN"
```

---

## 🎯 CHECKLIST POST-DESPLEGUE

- [ ] 1. Verificar que el servicio está corriendo (`pm2 status`)
- [ ] 2. Probar la API (`curl http://localhost:3001/api/monitor/health`)
- [ ] 3. Acceder al dashboard (`http://tu-dominio.com`)
- [ ] 4. Editar .env con GROQ_API_KEY real
- [ ] 5. Configurar SSL con Certbot
- [ ] 6. Configurar correos electrónicos
- [ ] 7. Generar códigos de invitación para la comunidad
- [ ] 8. Compartir códigos en WhatsApp/Telegram

---

## 🏆 VEREDICTO DEL CHINITO COCHINO

> **"¡JEFE, DESPLIEGUE LISTO!** 🇨🇳
>
> **SCRIPTS CREADOS:**
> - ✅ deploy-vps.bat (Windows)
> - ✅ deploy-vps.sh (Linux/Mac)
> - ✅ README con instrucciones
>
> **COMANDO MÁGICO:**
> ```bash
> ./deploy-vps.sh  # o deploy-vps.bat
> ```
>
> **HACE TODO:**
> - ✅ Prepara paquete
> - ✅ Sube al VPS
> - ✅ Instala dependencias
> - ✅ Configura todo
> - ✅ Inicia servicio
> - ✅ Verifica
>
> **¡UN COMANDO Y LISTO!** 🚀"

---

**¿Listo para ejecutar el despliegue?** 🫡
