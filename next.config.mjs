export default {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  outputFileTracingExcludes: { "/*": ["./data/**", "./backups/**"] },
};
