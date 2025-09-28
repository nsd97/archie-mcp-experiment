import Fastify from 'fastify';
import dotenv from 'dotenv';
import listingsRoutes from './routes/listings';
import queueRoutes from './routes/queue';
import tasksRoutes from './routes/tasks';

dotenv.config();

const app = Fastify({ logger: true });
app.register(listingsRoutes);
app.register(queueRoutes);
app.register(tasksRoutes);

app.get('/health', async () => {
  return { ok: true } as const;
});

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== 'test') {
  app
    .listen({ port, host: '0.0.0.0' })
    .then(() => {
      app.log.info(`Server running on port ${port}`);
    })
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}

export default app;
