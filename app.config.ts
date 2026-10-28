import 'dotenv/config';

export default ({ config }: { config: any }) => ({
  ...config,
  plugins: [
    "expo-share-intent"
  ],
  extra: {
    ...config.extra,
    API_URL: process.env.API_URL || 'https://api.flatmate.ismailabbasi.qzz.io',
    WHATSAPP_API_URL: process.env.WHATSAPP_API_URL || 'http://109.123.251.103:30010',
  },
});
