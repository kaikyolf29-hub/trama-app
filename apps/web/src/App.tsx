import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { WelcomeSender } from './auth/WelcomeSender';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/context';
import type { AuthClient } from './auth/types';
import { createAppRouter, type AppRouter } from './router';
import { defaultServices, ServicesContext, type Services } from './services';

interface AppProps {
  client: AuthClient;
  /** API de projetos e armazenamento de imagens; sem eles, as telas explicam o que falta. */
  services?: Services;
  /** Só nos testes: o histórico em memória. */
  history?: RouterHistory;
}

/** Casca do site: o login e as rotas. */
export function App({ client, services = defaultServices, history }: AppProps) {
  const [router] = useState(() => createAppRouter(client, history));
  return (
    <ServicesContext.Provider value={services}>
      <AuthProvider client={client}>
        <WelcomeSender />
        <RouterWithAuth router={router} />
      </AuthProvider>
    </ServicesContext.Provider>
  );
}

/** Quando a pessoa entra ou sai (até em outra aba), as guardas das rotas rodam de novo. */
function RouterWithAuth({ router }: { router: AppRouter }) {
  const { status } = useAuth();
  useEffect(() => {
    if (status !== 'loading') void router.invalidate();
  }, [status, router]);
  return <RouterProvider router={router} />;
}
