const fs = require('fs');
const path = require('path');

describe('app precision copy', () => {
  it('evita wording absoluto de exactitud en etiquetas visibles de App.jsx', () => {
    const content = fs.readFileSync(
      path.join(__dirname, '..', '..', 'client', 'src', 'App.jsx'),
      'utf8'
    );

    expect(content).toContain("consistente: 'Consistente'");
    expect(content).toContain("con_respaldo: 'Con respaldo'");
    expect(content).toContain('dato tiene respaldo real');
    expect(content).toContain('tan confiable es cada dato');
    expect(content).toContain('con confiabilidad por componente');
    expect(content).toContain('Cotiza con precision, revisa requisitos y toma decisiones de importacion con mas claridad.');
    expect(content).toContain('Una plataforma privada para miembros de Broke Shop que concentra cotizacion, revision y trazabilidad');
    expect(content).toContain('borrador de documento con datos suficientes para calcular');
    expect(content).toContain('Sesion iniciada. Ya puedes usar la comunidad.');
    expect(content).toContain("title: 'Acceso disponible'");
    expect(content).toContain('Tu cuenta puede cotizar, revisar historial y operar dentro de la comunidad.');
    expect(content).toContain('Acceso actualizado para ${user.email}.');
    expect(content).toContain('Podra volver a ingresar segun su rol actual.');
    expect(content).toContain('La cuenta podra operar si tambien esta activa.');
    expect(content).toContain('Contexto actual');
    expect(content).toContain('Revision requerida');
    expect(content).toContain("'Revisar accion'");
    expect(content).toContain("actionLabel || 'Revisar'");
    expect(content).toContain('const ADMIN_REVIEW_COPY = {');
    expect(content).toContain('const handleAdminReviewAction = async () => {');
    expect(content).toContain('La sesion ya no esta activa.');
    expect(content).toContain('todos los items deben tener precio unitario numerico positivo.');
    expect(content).toContain('Falta capturar un precio unitario numerico positivo.');
    expect(content).toContain('El panel de comunidad empezara a mostrar actividad cuando existan cotizaciones reales guardadas por tus miembros.');
    expect(content).toContain('Tu panel personal empezara a mostrar actividad cuando guardes tus primeras cotizaciones reales.');
    expect(content).not.toContain("consistente: 'Exacta'");
    expect(content).not.toContain("confirmado: 'Con respaldo'");
    expect(content).not.toContain("confirmado: 'Confirmado'");
    expect(content).not.toContain("confirmado: 'Exacto'");
    expect(content).not.toContain('dato esta confirmado');
    expect(content).not.toContain('dato es exacto');
    expect(content).not.toContain('tan exacto es cada dato');
    expect(content).not.toContain('con exactitud por componente');
    expect(content).not.toContain('Cotiza con precision, valida requisitos y toma decisiones de importacion con mas claridad.');
    expect(content).not.toContain('Una plataforma privada para miembros de Broke Shop que concentra cotizacion, validacion y trazabilidad');
    expect(content).not.toContain('borrador de documento listo para calcular');
    expect(content).not.toContain('Acceso verificado. Ya estas dentro de la comunidad.');
    expect(content).not.toContain("title: 'Miembro activo'");
    expect(content).not.toContain('Tu acceso ya esta habilitado para cotizar, revisar historial y operar dentro de la comunidad.');
    expect(content).not.toContain('Acceso reactivado para ${user.email}.');
    expect(content).not.toContain('Recuperara el ingreso segun su rol actual.');
    expect(content).not.toContain('La cuenta quedara habilitada para operar si tambien esta activa.');
    expect(content).not.toContain('Captura activa');
    expect(content).not.toContain('Confirmacion requerida');
    expect(content).not.toContain("'Confirmar accion'");
    expect(content).not.toContain("confirmLabel || 'Revisar'");
    expect(content).not.toContain('const ADMIN_CONFIRM_COPY = {');
    expect(content).not.toContain("confirmLabel || 'Confirmar'");
    expect(content).not.toContain('const handleAdminConfirmAction = async () => {');
    expect(content).not.toContain('La sesion ya no esta vigente.');
    expect(content).not.toContain('La sesion ya no es valida.');
    expect(content).not.toContain('todos los items deben tener precio unitario valido.');
    expect(content).not.toContain('Falta capturar un precio unitario valido.');
    expect(content).not.toContain('El panel de comunidad se activara cuando existan cotizaciones reales guardadas por tus miembros.');
    expect(content).not.toContain('Tu panel personal se activara cuando guardes tus primeras cotizaciones reales.');
  });
});
