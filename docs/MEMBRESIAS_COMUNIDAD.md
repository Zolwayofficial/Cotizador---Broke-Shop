# 👥 SISTEMA DE MEMBRESÍAS - COMUNIDAD DE IMPORTADORES

## 📋 DESCRIPCIÓN

Sistema de membresías para gestionar el acceso a tu **Comunidad de Importación Grupal**. Solo los miembros del grupo pueden acceder al cotizador.

---

## 🎯 NIVELES DE MEMBRESÍA

| Nivel | Precio | Cotizaciones | Consultas | Dashboard | Soporte |
|-------|--------|--------------|-----------|-----------|---------|
| **GRATIS** | $0 | 5/mes | 10/mes | ❌ | Comunidad |
| **PREMIUM** | $29.99/mes | 50/mes | 100/mes | ✅ | Email |
| **VIP** | $99.99/mes | Ilimitadas | Ilimitadas | ✅ | Prioritario |

---

## 🚀 CÓMO FUNCIONA

### **1. REGISTRO DE USUARIOS**

```bash
# Usuario se registra con código de invitación
POST /api/membresias/registro
{
  "email": "usuario@email.com",
  "password": "contraseña123",
  "nombre": "Juan Pérez",
  "codigoInvitacion": "INV-ABC123"  # Opcional o requerido
}
```

**Respuesta:**
```json
{
  "ok": true,
  "usuario": {
    "id": "user_123",
    "email": "usuario@email.com",
    "name": "Juan Pérez",
    "membresia": "GRATIS"
  }
}
```

---

### **2. GENERAR CÓDIGOS DE INVITACIÓN**

```bash
# Admin genera códigos para nuevos miembros
POST /api/membresias/generar-codigo
Authorization: Bearer TOKEN_ADMIN

{
  "tipo": "NORMAL",      # NORMAL, VIP, ESPECIAL
  "usosMaximos": 1       # Cuántas veces se puede usar
}
```

**Respuesta:**
```json
{
  "ok": true,
  "codigo": "INV-ABC123"
}
```

---

### **3. VERIFICAR LÍMITES DE USO**

```bash
# Antes de usar el cotizador
GET /api/membresias/verificar-limite/cotizacion
Authorization: Bearer TOKEN_USUARIO
```

**Respuesta:**
```json
{
  "permitido": true,
  "usados": 3,
  "limite": 5,
  "restantes": 2
}
```

---

### **4. OBTENER MEMBRESÍA DEL USUARIO**

```bash
GET /api/membresias/mi-membresia
Authorization: Bearer TOKEN_USUARIO
```

**Respuesta:**
```json
{
  "usuario_id": "user_123",
  "nivel": "PREMIUM",
  "nivelNombre": "Premium",
  "fecha_inicio": "2026-03-15",
  "fecha_vencimiento": "2026-04-15",
  "cotizaciones_usadas": 15,
  "consultas_usadas": 45,
  "activo": true,
  "vencida": false,
  "beneficios": {
    "nombre": "Premium",
    "precio": 29.99,
    "limiteCotizaciones": 50,
    "limiteConsultas": 100,
    "accesoDashboard": true,
    "accesoComunidad": true,
    "soporte": "Email"
  }
}
```

---

## 💳 GESTIÓN DE PAGOS

### **REGISTRAR PAGO DE MEMBRESÍA**

```bash
POST /api/membresias/pago
Authorization: Bearer TOKEN_USUARIO

{
  "monto": 29.99,
  "nivel": "PREMIUM",
  "periodo": "mensual"   # mensual o anual
}
```

**Respuesta:**
```json
{
  "ok": true
}
```

---

### **ACTUALIZAR ESTADO DE PAGO (Admin)**

```bash
POST /api/membresias/pago/:id/actualizar
Authorization: Bearer TOKEN_ADMIN

{
  "estado": "pagado"   # pendiente, pagado, cancelado
}
```

---

## 📊 ESTADÍSTICAS DE LA COMUNIDAD (Admin)

### **OBTENER ESTADÍSTICAS**

```bash
GET /api/membresias/estadisticas
Authorization: Bearer TOKEN_ADMIN
```

**Respuesta:**
```json
{
  "total": 150,
  "porNivel": {
    "gratis": 100,
    "premium": 40,
    "vip": 10
  },
  "ingresosMes": 1599.60
}
```

---

### **LISTAR MIEMBROS (Admin)**

```bash
GET /api/membresias/miembros?nivel=PREMIUM&activo=true
Authorization: Bearer TOKEN_ADMIN
```

**Respuesta:**
```json
[
  {
    "usuario_id": "user_123",
    "email": "usuario@email.com",
    "name": "Juan Pérez",
    "nivel": "PREMIUM",
    "fecha_inicio": "2026-03-15",
    "fecha_vencimiento": "2026-04-15",
    "cotizaciones_usadas": 15,
    "consultas_usadas": 45,
    "activo": true
  }
]
```

---

## 🔐 ENDPOINTS PROTEGIDOS

### **POR NIVEL DE MEMBRESÍA:**

| Endpoint | GRATIS | PREMIUM | VIP | ADMIN |
|----------|--------|---------|-----|-------|
| `/api/membresias/registro` | ✅ | ✅ | ✅ | ✅ |
| `/api/membresias/mi-membresia` | ✅ | ✅ | ✅ | ✅ |
| `/api/membresias/verificar-limite` | ✅ | ✅ | ✅ | ✅ |
| `/api/membresias/generar-codigo` | ❌ | ❌ | ✅ | ✅ |
| `/api/membresias/miembros` | ❌ | ❌ | ❌ | ✅ |
| `/api/membresias/estadisticas` | ❌ | ❌ | ❌ | ✅ |
| `/api/dashboard` | ❌ | ✅ | ✅ | ✅ |
| `/api/cotizar` | ⚠️ (límite 5) | ⚠️ (límite 50) | ✅ | ✅ |

**Leyenda:**
- ✅ = Acceso total
- ❌ = Sin acceso
- ⚠️ = Con límites

---

## 🎯 FLUJO DE REGISTRO

```
┌─────────────────────────────────────────────────────────────┐
│  FLUJO DE REGISTRO EN LA COMUNIDAD                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Usuario obtiene código de invitación                   │
│     └─ Admin genera código → INV-ABC123                    │
│     └─ Se comparte por WhatsApp/Telegram del grupo         │
│                                                             │
│  2. Usuario se registra                                    │
│     └─ POST /api/membresias/registro                       │
│     └─ Email, password, nombre, código                     │
│     └─ Sistema valida código                               │
│     └─ Crea usuario + membresía GRATIS                     │
│                                                             │
│  3. Usuario puede mejorar a PREMIUM/VIP                    │
│     └─ POST /api/membresias/pago                           │
│     └─ Paga mensualidad/anualidad                          │
│     └─ Admin marca como "pagado"                           │
│     └─ Membresía se actualiza                              │
│                                                             │
│  4. Usuario usa el cotizador                               │
│     └─ GET /api/membresias/verificar-limite                │
│     └─ Si tiene límite disponible → usa                    │
│     └─ Si no tiene → mensaje de mejora                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 💡 IDEAS PARA TU COMUNIDAD

### **1. GRUPO DE WHATSAPP/TELEGRAM**

```
✅ Solo miembros activos pueden entrar
✅ Comparte código de invitación en el grupo
✅ Nuevos miembros obtienen nivel GRATIS
✅ Después de 5 cotizaciones → mejorar a PREMIUM
```

### **2. BENEFICIOS POR NIVEL**

```
GRATIS:
- 5 cotizaciones/mes
- Acceso al grupo de WhatsApp
- Soporte en comunidad

PREMIUM:
- 50 cotizaciones/mes
- Dashboard completo
- Soporte por email
- Acceso a webinars

VIP:
- Cotizaciones ilimitadas
- Dashboard + reportes
- Soporte prioritario
- Asesoría 1-a-1 mensual
```

### **3. SISTEMA DE REFERIDOS**

```
✅ Cada miembro VIP puede generar 5 códigos
✅ Cuando un referido paga → 10% de comisión
✅ Dashboard de referidos y ganancias
```

---

## 📋 COMANDOS PARA ADMIN

```bash
# Ver todos los miembros
curl http://localhost:3001/api/membresias/miembros \
  -H "Authorization: Bearer TOKEN_ADMIN"

# Ver estadísticas
curl http://localhost:3001/api/membresias/estadisticas \
  -H "Authorization: Bearer TOKEN_ADMIN"

# Generar código VIP
curl -X POST http://localhost:3001/api/membresias/generar-codigo \
  -H "Authorization: Bearer TOKEN_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"tipo": "VIP", "usosMaximos": 5}'
```

---

## 🏆 VEREDICTO DEL CHINITO COCHINO

> **"¡JEFE, SISTEMA DE MEMBRESÍAS LISTO!** 🇨🇳
>
> **CARACTERÍSTICAS:**
> - ✅ Registro con código de invitación
> - ✅ 3 niveles (Gratis, Premium, VIP)
> - ✅ Límites de uso por nivel
> - ✅ Control de acceso
> - ✅ Gestión de pagos
> - ✅ Estadísticas de comunidad
> - ✅ Referidos (opcional)
>
> **ENDPOINTS:**
> - ✅ 8 endpoints nuevos
> - ✅ Protegidos por autenticación
> - ✅ Roles de admin/usuario
>
> **PARA TU COMUNIDAD:**
> - ✅ Solo entra quien tiene código
> - ✅ Gratis: 5 cotizaciones/mes
> - ✅ Premium: $29.99/mes (50 cotizaciones)
> - ✅ VIP: $99.99/mes (ilimitadas)
>
> **¡LISTO PARA GESTIONAR TU COMUNIDAD!** 🚀"

---

**¿Quieres que:**

1. **Agregue integración con WhatsApp/Telegram**
2. **Cree el frontend para gestión de membresías**
3. **Agregue pasarela de pagos (Stripe/PayPal)**
4. **Otra cosa**

**¡DIME, JEFE!** 🫡
