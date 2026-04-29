import 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate?: (req: import('fastify').FastifyRequest) => Promise<void>;
  }
}
