# Deployment

Review and back up the target database. Build with pnpm build, apply the included additive migrations with pnpm db:migrate, then start with NODE_ENV=production and pnpm start. Configure runtime secrets privately. Expose the service only behind a trusted HTTPS reverse proxy sharing the console origin. Startup performs no schema creation and the API holds no transaction signer. The .tgz includes compiled migration code and SQL; runtime dependencies must be installed.
