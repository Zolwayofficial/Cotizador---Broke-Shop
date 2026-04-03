const { describe, expect, it } = require('@jest/globals');

const { _private } = require('../../server/conectores-gobierno');

describe('conectores-gobierno parsers ADUANET', () => {
  it('usa un user-agent neutral y no arrastra mensajes de marca antiguos en el source', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'conectores-gobierno.js'), 'utf8');

    expect(content).toContain('ImportAIAgentCotizador/1.0');
    expect(content).not.toContain('CotizadorPeru/1.0');
    expect(content).not.toContain('CotizadorPeruUltimate/3.0');
    expect(content).not.toMatch(/Ã|â|ConexiÃ|hidrobiolÃ/);
  });

  it('parsea el detalle arancelario con gravamenes y enlaces', () => {
    const html = `
      <html>
        <body>
          TIPO DE PRODUCTO:</td>
          <td><font><b></b>&nbsp;&nbsp;LEY 29666-IGV 20.02.11</font></td>
          <table>
            <tr><td>Ad / Valorem</td><td>0%</td></tr>
            <tr><td>Impuesto General a las Ventas</td><td>15.5%</td></tr>
            <tr><td>Impuesto de Promocion Municipal</td><td>2.5%</td></tr>
            <tr><td>Derecho Antidumping</td><td>N.A.</td></tr>
            <tr><td>Seguro</td><td>1.75%</td></tr>
          </table>
          <a href="/itarancel/arancelS01Alias?accion=consultarConvenio&cod_partida=8517130000">Convenios</a>
          <a href="/itarancel/arancelS01Alias?accion=consultarPartidaRestriccion&cod_partida=8517130000">Restricciones</a>
          <a href="/itarancel/arancelS01Alias?accion=consultarPartidaDescripciones&cod_partida=8517130000">Descr. Minimas</a>
          <a href="/itarancel/arancelS01Alias?cmbCriterio=1&cod_partida=8517130000">Resoluciones</a>
        </body>
      </html>
    `;

    const parsed = _private.parseAduanetDetalle(html, '8517130000');

    expect(parsed.gravamenes.adValorem).toBe(0);
    expect(parsed.gravamenes.igv).toBe(15.5);
    expect(parsed.gravamenes.ipm).toBe(2.5);
    expect(parsed.gravamenes.seguro).toBe(1.75);
    expect(parsed.gravamenes.tipoProducto).toMatch(/LEY 29666/i);
    expect(parsed.enlaces.convenios).toMatch(/consultarConvenio/);
    expect(parsed.enlaces.restricciones).toMatch(/consultarPartidaRestriccion/);
    expect(parsed.enlaces.descripcionesMinimas).toMatch(/consultarPartidaDescripciones/);
    expect(parsed.enlaces.resolucionesClasificacion).toMatch(/cmbCriterio=1/);
  });

  it('detecta convenios coincidentes con el pais de origen', () => {
    const html = `
      <table>
        <tr>
          <th>PAIS</th><th>CONVENIO INTERNACIONAL</th><th>P.NALADISA</th><th>T.MARGEN</th>
          <th>FECHA DE VIGENCIA</th><th>ARANCEL BASE/PREFERENCIAL</th><th>PORCENTAJE LIBERADO ADV</th><th>OBSERVACION</th>
        </tr>
        <tr>
          <td>China</td><td>APC Peru-China</td><td>8517.13.00</td><td>100%</td>
          <td>Vigente</td><td>Base 0% / Preferencial 0%</td><td>100%</td><td>Aplica con origen valido</td>
        </tr>
        <tr>
          <td>Brasil</td><td>AAP.CE 58</td><td>8517.13.00</td><td>20%</td>
          <td>Vigente</td><td>Base 6% / Preferencial 4%</td><td>20%</td><td>-</td>
        </tr>
      </table>
    `;

    const parsed = _private.parseAduanetConvenios(html, 'CN');

    expect(parsed.items).toHaveLength(2);
    expect(parsed.coincidencias).toHaveLength(1);
    expect(parsed.mejorCoincidencia.acuerdo).toMatch(/Peru-China/i);
  });

  it('parsea restricciones y entidades de control', () => {
    const html = `
      <table>
        <tr>
          <th>REGIMEN</th><th>COD</th><th>DESCRIPCION</th><th>CONTROL</th><th>DESDE</th><th>HASTA</th><th>BASE LEGAL</th>
        </tr>
        <tr>
          <td>Importacion para el consumo</td><td>12</td><td>Homologacion previa</td><td>MTC</td><td>2020-01-01</td><td>-</td><td>DS 001-2020</td>
        </tr>
        <tr>
          <td>Importacion para el consumo</td><td>18</td><td>Control sanitario</td><td>DIGESA</td><td>2021-05-10</td><td>-</td><td>RM 123-2021</td>
        </tr>
      </table>
    `;

    const parsed = _private.parseAduanetRestricciones(html);

    expect(parsed.items).toHaveLength(2);
    expect(parsed.entidades).toEqual(expect.arrayContaining(['MTC', 'DIGESA']));
  });

  it('parsea descripciones minimas', () => {
    const html = `
      <table>
        <tr><td>DESCR.1</td><td>Marca, modelo y tecnologia de conectividad</td></tr>
        <tr><td>DESCR.2</td><td>Capacidad de memoria y accesorios incluidos</td></tr>
      </table>
    `;

    const parsed = _private.parseAduanetDescripciones(html);

    expect(parsed).toHaveLength(2);
    expect(parsed[0].codigo).toBe('DESCR.1');
    expect(parsed[1].descripcion).toMatch(/memoria/i);
  });
});
