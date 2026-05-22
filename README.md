# 💰 Mis Finanzas v1.2

App móvil de gestión de ingresos y gastos personales, desarrollada con React Native + Expo.

## ✨ Funcionalidades

- Registrar ingresos y gastos con descripción, monto y fecha
- Filtrar por período: Diario, Semanal, Bisemanal, Quincenal, Mensual
- Presupuesto con barra de progreso y alertas
- Historial de períodos cerrados (hasta 30)
- Reutilizar movimientos de períodos anteriores
- Exportar reporte en PDF o CSV
- Compartir resumen por WhatsApp / Telegram
- Soporte de monedas: ₡ CRC, $ USD, € EUR
- Persistencia local con AsyncStorage

---

## 🚀 Instalación local

```bash
# 1. Clonar el repo
git clone https://github.com/TU_USUARIO/mis-finanzas.git
cd mis-finanzas

# 2. Instalar dependencias
npm install

# 3. Correr en desarrollo
npx expo start
```

Escaneá el QR con la app **Expo Go** en tu celular.

---

## 📦 Buildear APK con EAS Build

### Prerequisitos
```bash
npm install -g eas-cli
eas login          # Iniciá sesión en expo.dev
eas init           # Vincula el proyecto → copiá el projectId en app.json
```

### Build APK (preview — para instalar directo en Android)
```bash
eas build -p android --profile preview
```

### Build AAB (producción — para Google Play)
```bash
eas build -p android --profile production
```

El APK/AAB se descarga desde **expo.dev → tu proyecto → Builds**.

---

## 🖼️ Assets requeridos

Colocar en la carpeta `/assets/`:

| Archivo | Tamaño | Descripción |
|---|---|---|
| `icon.png` | 1024×1024 | Ícono de la app |
| `splash.png` | 1284×2778 | Pantalla de carga |
| `adaptive-icon.png` | 1024×1024 | Ícono adaptativo Android |

---

## 🛠️ Stack técnico

- React Native 0.74
- Expo SDK 51
- AsyncStorage — persistencia local
- expo-print + expo-sharing — exportación PDF
- react-native-safe-area-context — manejo de safe areas

---

## 👤 Autor

Desarrollado por **ALVA**
