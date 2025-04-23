module.exports = {
  apps: [{
    name: 'wick3d-link-portal',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    max_memory_restart: '500M',
    restart_delay: 10000 // 10 seconds delay between restarts
  }]
};