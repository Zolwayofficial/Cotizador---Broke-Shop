# Pendientes de Integracion y Recomendaciones 2026

Este documento resume que queda pendiente despues de la auditoria, que ya esta integrado y cual es la estrategia recomendada para produccion.

## Estado actual recomendado

La configuracion mas realista y robusta hoy es:

- IA principal con Groq.
- Agentes navegadores para SUNAT, ADUANET, VUCE y otras fuentes publicas.
- Fallbacks referenciales para flete cuando no haya agregadores activos.
- Dashboard con datos reales guardados y degradacion controlada cuando no haya IA o historial suficiente.

## Ya integrado

- Chat de cotizacion como entrada principal.
- Dashboard secundario alimentado por datos reales.
- Registro oficial de 30 agentes.
- Cadena de fallback de modelos para IA general y dashboard.
- Validacion de entorno de produccion.
- Scripts de despliegue para Windows y Unix.
- Documentacion canonica y matriz de APIs investigadas.

## Pendientes de integracion externa

### Imprescindible para el stack actual

- Ninguno mas bloquea el funcionamiento base.

### Muy recomendables

- SMTP real para envio de cotizaciones por correo.
- `TRACK17_API_KEY` si quieres tracking universal mas serio.

### Opcionales

- `SHIPPO_TOKEN`
- `EASYPOST_TOKEN`
- `AFTERSHIP_TOKEN`
- `INTERPARCEL_TOKEN`
- `PARCELMONKEY_TOKEN`
- `TRACKINGMORE_API_KEY`
- `SEARATES_API_KEY`
- `OLCE API`

## Recomendacion estrategica

No perseguir demasiadas APIs de pago o con onboarding complejo en esta fase.

La mejor estrategia costo-beneficio para este proyecto hoy es:

1. Mantener Groq como nucleo de IA.
2. Explotar al maximo los agentes navegadores y scraping controlado.
3. Conservar fletes referenciales y cotizadores personalizados como respaldo.
4. Integrar agregadores reales solo cuando haya necesidad comercial clara.

## Riesgos operativos restantes

- Sin SMTP real, el envio final por correo queda en fallback.
- Sin tracking API, el rastreo universal sera limitado.
- Sin agregadores de shipping, la cotizacion de courier seguira siendo referencial o personalizada.
- Algunas fuentes gubernamentales siguen dependiendo de estructura HTML publica y pueden cambiar sin aviso.

## Recomendacion para produccion

Subir esta version a una rama de respaldo en GitHub y luego desplegar desde esa rama una vez validados:

- `GROQ_API_KEY`
- `JWT_SECRET`
- `ALLOWED_ORIGINS` o dominio final
- smoke local del chat
- smoke del dashboard
- health checks

## Nota de seguridad

Nunca subir a GitHub:

- `.env`
- `.env.production`
- bases `.db`
- logs locales
- datos de usuario reales
