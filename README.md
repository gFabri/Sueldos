# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Android - Horarios

La app Android esta creada con Capacitor y abre directamente el apartado de horarios.

Comandos utiles:

```bash
npm run android:sync
npm run android:open
```

Para compilar APK desde terminal:

```bash
cd android
gradlew.bat assembleDebug
```

Requisitos para compilar:

- Android Studio o Android SDK configurado.
- JDK compatible con Android/Gradle, preferentemente 17 o 21.

Nota: la sincronizacion de horarios en Android usa CapacitorHttp para llamar directo a Autogestion. En web sigue usando el proxy `/api/autogestion`.
