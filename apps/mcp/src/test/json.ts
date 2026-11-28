/** O corpo JSON de uma resposta, com o tipo que o teste espera (os testes conferem os campos). */
export function jsonOf<T>(response: Request | Response): Promise<T> {
  return response.json<T>();
}
