module.exports = {
  apps: [
    {
      name: 'cotizador',
      script: 'server/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '750M',
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      out_file: './data/logs/pm2-out.log',
      error_file: './data/logs/pm2-error.log',
      merge_logs: true,
    },
  ],
};
