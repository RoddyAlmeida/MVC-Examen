document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('theme-toggle');
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  
  // Function to set theme
  const setTheme = (theme) => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
      if (themeToggleBtn) {
        themeToggleBtn.innerHTML = '<i class="ti ti-sun" aria-hidden="true"></i>';
        themeToggleBtn.setAttribute('aria-label', 'Cambiar a modo claro');
      }
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
      if (themeToggleBtn) {
        themeToggleBtn.innerHTML = '<i class="ti ti-moon" aria-hidden="true"></i>';
        themeToggleBtn.setAttribute('aria-label', 'Cambiar a modo oscuro');
      }
    }
  };

  // Check for saved user preference, if any, on load of the website
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    // Default to light theme as requested
    setTheme('light');
  }

  // Toggle theme on button click
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      if (currentTheme === 'dark') {
        setTheme('light');
      } else {
        setTheme('dark');
      }
    });
  }
});
