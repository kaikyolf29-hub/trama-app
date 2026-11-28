import {
  GrantType,
  OAuthError,
  type TokenExchangeCallbackOptions,
  type TokenExchangeCallbackResult,
} from '@cloudflare/workers-oauth-provider';
import type { Deps } from './deps';
import type { AccessProps, Env, GrantProps } from './env';
import { SessionEndedError, refreshSession } from './supabase';
import { CryptoError, refreshTokenAad, vaultFor } from './vault';

/**
 * Cada vez que o cliente MCP troca o código ou renova o token, o conector renova também a sessão
 * da pessoa no Supabase: o refresh token (cifrado nas props da concessão) vira um token de
 * acesso novo, que vive só dentro do token de acesso do MCP (também cifrado pela biblioteca) e
 * dura o mesmo que ele. O refresh token novo substitui o antigo na concessão, cifrado de novo.
 * Nada disso sai do Worker: o cliente MCP só recebe os tokens do próprio MCP.
 *
 * Se o Supabase diz que a sessão acabou (a pessoa saiu de todas as sessões, trocou a senha), a
 * concessão é revogada (`invalid_grant`) e o cliente precisa pedir permissão de novo. Qualquer
 * outra falha (Supabase fora do ar) deixa a concessão como está, para tentar outra vez.
 */
export async function exchangeSupabaseSession(
  options: TokenExchangeCallbackOptions<Env>,
  deps: Deps,
): Promise<TokenExchangeCallbackResult | void> {
  if (
    options.grantType !== GrantType.AUTHORIZATION_CODE &&
    options.grantType !== GrantType.REFRESH_TOKEN
  ) {
    return;
  }
  const props = options.props as GrantProps;
  const vault = await vaultFor(options.env.MCP_ENCRYPTION_KEY);
  if (!vault) {
    throw new OAuthError('server_error', {
      description: 'O conector ainda não está configurado.',
      statusCode: 503,
    });
  }
  const aad = refreshTokenAad(props.userId);

  let refreshToken: string;
  try {
    refreshToken = await vault.decrypt(props.sealedRefreshToken, aad);
  } catch (error) {
    if (!(error instanceof CryptoError)) throw error;
    // A chave mudou ou o dado foi adulterado: esta concessão nunca mais vai abrir.
    throw new OAuthError('invalid_grant', {
      description: 'O acesso deste conector não vale mais. Conecte de novo.',
    });
  }

  let session;
  try {
    session = await refreshSession(options.env, refreshToken, deps.fetch);
  } catch (error) {
    if (error instanceof SessionEndedError) {
      throw new OAuthError('invalid_grant', {
        description: 'A sua conta do Trama não permite mais este acesso. Conecte de novo.',
      });
    }
    throw new OAuthError('temporarily_unavailable', {
      description: 'O login do Trama não respondeu. Tente de novo em instantes.',
      statusCode: 503,
    });
  }

  const nextProps: GrantProps = {
    ...props,
    sealedRefreshToken: await vault.encrypt(session.refreshToken, aad),
  };
  const accessProps: AccessProps = {
    userId: props.userId,
    grantId: options.grantId,
    clientName: props.clientName,
    supabaseAccessToken: session.accessToken,
  };
  return {
    newProps: nextProps,
    accessTokenProps: accessProps,
    // O token do MCP vence um minuto antes do token do Supabase (e dura no máximo uma hora).
    accessTokenTTL: Math.max(60, Math.min(session.expiresIn - 60, 3600)),
  };
}
