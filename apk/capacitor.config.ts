import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.prompterstudio.app',
  appName: 'Prompter Studio',
  webDir: 'www',
  server: {
    // https-схема → secure context (нужен для getUserMedia/камеры внутри WebView)
    androidScheme: 'https',
    // разрешаем http:// и ws:// к LAN-серверу (Next.js :3000 / socket.io :3030)
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
