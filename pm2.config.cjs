module.exports = {
  apps: [
    {
      name: "agent-server",
      script: "pnpm",
      args: "--filter @narc/agent-server start",
      cwd: "/home/ec2-user/narc",
      interpreter: "none",
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
