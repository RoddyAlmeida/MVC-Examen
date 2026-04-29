# Informe UX y Accesibilidad

## 1) Contexto
- Sistema evaluado: Examen en linea MVC
- Alcance: flujo inicio -> resolucion -> resultado

## 2) Heuristicas revisadas (evaluacion heuristica)
- Visibilidad del estado del sistema
- Consistencia y estandares
- Prevencion y manejo de errores
- Reconocimiento antes que recuerdo
- Flexibilidad y eficiencia de uso
- Accesibilidad universal (teclado, lector de pantalla, independencia del color)

## 3) Evidencias de cumplimiento
- Regla cognitiva: maximo 5 preguntas por pantalla
- Mensajes no dependientes del color: icono + texto + bloque de alerta
- Soporte lector de pantalla: `aria-label`, `role=alert`, `aria-live`
- Soporte de voz: lectura por voz (SpeechSynthesis) y comandos por voz (SpeechRecognition)
- Soporte de entrada multiple: teclado (tab/foco), mouse y comandos de texto/voz

## 3.1) Verificacion interna contra requisitos de la actividad
- Capa de vista UX/HCI:
  - Cumple regla `5 +/- 2` al limitar a 5 preguntas por pantalla.
  - Cumple consistencia estetica con sistema visual comun (cards, botones, formularios, feedback).
  - Cumple disminucion de carga mental con copy directo y opciones visibles.
- Accesibilidad universal:
  - Cumple independencia del color: errores y estados muestran texto e iconografia.
  - Cumple soporte de voz para asistencia de navegacion y ejecucion de comandos.
  - Cumple flexibilidad de entrada: mouse, teclado y comandos de apoyo.
- Evaluacion y pruebas:
  - Se incluye plantilla sistematizada de heuristica en `docs/evaluacion-heuristica.md`.
  - Se incluye protocolo Think Aloud en `docs/think-aloud.md`.

## 4) Prueba Think Aloud (plantilla)
- Participantes:
- Tareas:
  - Iniciar examen
  - Completar respuestas
  - Corregir errores de envio
  - Interpretar resultado
- Hallazgos:
- Fricciones observadas:
- Cambios propuestos:

## 5) Relacion con ISO 9241 (justificacion)
- Eficacia: usuario completa el examen y recibe retroalimentacion clara
- Eficiencia: pasos minimos y estructura consistente
- Satisfaccion: lenguaje claro, baja carga mental y navegacion predecible

## 6) Referencia base
- D'Adamo, M. H., et al. (2011). Interaccion ser humano-computadora: usabilidad y universalidad en la era de la informacion.
