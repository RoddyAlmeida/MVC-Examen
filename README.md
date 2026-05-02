# 🎓 Sistema de Examen en Línea MVC - UX & Accessibility Edition

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)

Este proyecto es una plataforma de evaluación educativa desarrollada bajo el patrón **Modelo-Vista-Controlador (MVC)**, diseñada específicamente para demostrar las mejores prácticas en **Usabilidad (UX)**, **Accesibilidad (A11y)** y **Ergonomía Cognitiva**.

---

## 🌟 Características Principales

### 🧠 Ergonomía Cognitiva & UX
- **Regla de Miller ($5 \pm 2$):** Interfaz diseñada para no saturar la memoria de trabajo, limitando los elementos interactivos por pantalla.
- **Diseño Premium:** Estética moderna con *Glassmorphism*, tipografía *Inter* y micro-animaciones fluidas.
- **Modo Oscuro Dinámico:** Soporte nativo para temas claro y oscuro con persistencia en `localStorage`.
- **Carga Mental Reducida:** Navegación intuitiva y lenguaje claro para evitar la fatiga del estudiante.

### ♿ Accesibilidad (A11y)
- **Independencia del Color:** Uso de **Tabler Icons** y etiquetas de texto para comunicar estados (errores, éxitos) sin depender únicamente del color.
- **Navegación por Teclado:** Foco visual de alto contraste y soporte completo para navegación secuencial.
- **Soporte de Voz:** Implementación exhaustiva de etiquetas `aria-label` y roles semánticos para lectores de pantalla.
- **Lectura Guiada:** Script de narración integrado para asistir a usuarios con discapacidad visual.

---

## 🛠️ Stack Tecnológico

- **Backend:** Node.js + Express
- **Frontend:** EJS (Embedded JavaScript templates) + CSS3 (Variables, HSL, Glassmorphism)
- **ORM:** Sequelize
- **Base de Datos:** SQLite (Persistente mediante volúmenes)

---

## 🚀 Despliegue con Docker (Recomendado)

La forma más rápida y segura de ejecutar el proyecto, evitando problemas de dependencias nativas como `sqlite3`.

### 1. Clonar el Repositorio
```bash
git clone https://github.com/RoddyAlmeida/MVC-Examen.git
cd MVC-Examen
```

### 2. Levantar el Entorno
Este comando construirá la imagen y levantará el contenedor en segundo plano:
```bash
docker-compose up -d --build
```

### 3. Inicializar Datos (Solo la primera vez)
Ejecuta el script de *seeding* para poblar la base de datos con preguntas de ejemplo:
```bash
docker-compose exec app npm run seed
```

### 4. Acceder a la Aplicación
Abre tu navegador en: [http://localhost:3000](http://localhost:3000)

---

## 💻 Desarrollo Local

Si prefieres ejecutarlo sin Docker, asegúrate de tener **Node.js 20+**.

1. **Instalar dependencias:**
   ```bash
   npm install
   ```
2. **Poblar base de datos:**
   ```bash
   npm run seed
   ```
3. **Iniciar en modo desarrollo:**
   ```bash
   npm run dev
   ```

---

## 📂 Estructura del Proyecto

```text
├── config/         # Configuración de DB y Sequelize
├── controllers/    # Lógica de negocio y flujo del examen
├── models/         # Definición de modelos (Exam, Question)
├── public/         # Recursos estáticos (CSS, JS, Imágenes)
│   ├── css/        # Estilos premium y variables de tema
│   └── js/         # Lógica de accesibilidad y toggle de tema
├── routes/         # Definición de rutas del sistema
├── views/          # Plantillas EJS (Estructura semántica)
├── scripts/        # Scripts de utilidad (seeding)
└── data/           # Base de datos SQLite persistente
```

---

## ⌨️ Atajos de Teclado (Accesibilidad)

- `Alt + L`: Limpiar respuestas seleccionadas.
- `Alt + I`: Volver a la pantalla de inicio.
- `Ctrl + Enter`: Enviar examen actual.