# Evaluacion Heuristica Sistematizada

## Escala de severidad
- 0: No es problema
- 1: Cosmetic
- 2: Menor
- 3: Mayor
- 4: Critico

## Matriz de evaluacion

| Heuristica | Evidencia observada | Hallazgo | Severidad | Accion correctiva |
|---|---|---|---|---|
| Visibilidad del estado del sistema | Alertas y estado de comandos | El progreso no era visible en tiempo real (resuelto con barra de progreso) | 1 | Mantener contador y barra de avance activos |
| Correspondencia con el mundo real | Lenguaje simple en interfaz | Sin hallazgos relevantes | 0 | Mantener vocabulario no tecnico |
| Control y libertad del usuario | Comandos inicio/limpiar/enviar | Sin boton de limpieza visible en formulario principal | 1 | Conservar comando `limpiar` y documentarlo |
| Consistencia y estandares | Botones y formularios uniformes | Sin hallazgos relevantes | 0 | Mantener guia visual actual |
| Prevencion de errores | Validacion de respuestas obligatorias | Sin hallazgos relevantes | 0 | Mantener validacion server-side |
| Reconocimiento antes que recuerdo | Opciones visibles por pregunta | Sin hallazgos relevantes | 0 | Mantener estructura por tarjetas |
| Flexibilidad y eficiencia de uso | Teclado, mouse y comandos de texto/voz | Requiere permisos de microfono y navegador compatible | 1 | Incluir guia de activacion de permisos en pruebas |
| Diseno estetico minimalista | Jerarquia visual y baja saturacion | Sin hallazgos relevantes | 0 | Mantener contraste y espaciado |
| Ayuda para reconocer errores | Bloque de error con texto + icono | Sin hallazgos relevantes | 0 | Mantener `role=alert` y texto explicito |
| Accesibilidad universal | aria-label, focus, no solo color | Sin hallazgos criticos detectados | 0 | Validar con Lighthouse/Axe antes de entrega |

## Resultado global
- Cantidad de problemas criticos: 0
- Cantidad de problemas mayores: 0
- Prioridad de remediacion: baja (continuar pruebas con usuarios reales)
