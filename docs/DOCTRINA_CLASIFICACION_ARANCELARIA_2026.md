# Doctrina de Clasificacion Arancelaria 2026

Referencia interna construida a partir de:

- [AN20_SEM6_Nomenclatura y clasificacion arancelaria.pdf](C:/Users/Billy/Downloads/AN20_SEM6_Nomenclatura%20y%20clasificacion%20arancelaria.pdf)

## Ideas base que el clasificador debe respetar

- La clasificacion arancelaria no es solo semantica; parte de un analisis merceologico de la mercancia.
- Antes de proponer una subpartida, el analisis debe mirar:
  - origen o procedencia
  - propiedades fisicas
  - propiedades quimicas cuando afecten la naturaleza
  - variedad comercial, presentacion y uso final
  - alteraciones como mercancia usada, deteriorada o reacondicionada
  - falsificaciones o imitaciones de otra materia o marca

## Reglas Generales Interpretativas a reforzar

- `RGI 1`: manda el texto de la partida y las notas legales.
- `RGI 2a`: cubre articulos incompletos, sin terminar, desmontados o sin montar con caracter esencial.
- `RGI 2b`: cubre mezclas o asociaciones de materias y deriva al analisis de la `RGI 3`.
- `RGI 3a`: la descripcion mas especifica prevalece sobre la generica.
- `RGI 3b`: mezclas, compuestos y surtidos se resuelven por caracter esencial.
- `RGI 3c`: si no basta 3a o 3b, usar la ultima partida por orden numerico razonable.
- `RGI 4`: usar analogia cuando las reglas anteriores no permitan clasificar.
- `RGI 5a/5b`: estuches, continentes y envases se clasifican con la mercancia en escenarios tipicos.
- `RGI 6`: para subpartidas solo se comparan subpartidas del mismo nivel.

## Regla operativa para la IA

Si el texto del producto sugiere:

- mercancia usada o alterada
- articulo incompleto o desmontado
- mezcla de materias
- juego, kit o surtido
- estuche o envase con la mercancia

el clasificador debe explicitar la RGI que esta usando y reducir confianza si no tiene base suficiente en el texto legal o en NANDINA.
