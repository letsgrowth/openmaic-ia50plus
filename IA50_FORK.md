# OpenMAIC — fork controlado do IA 50+

Este repositório é o motor educacional interno do IA 50+. Ele deriva do
OpenMAIC `v0.3.1`, commit `04acb17c1a3e7aca5f717ab7e9a94a9ab73cf3a0`,
sob licença MIT. O arquivo `LICENSE` e os avisos de terceiros do upstream devem
ser preservados em toda distribuição.

## Limites do MVP

- A plataforma IA 50+ continua sendo autoridade exclusiva para identidade,
  planos, créditos, permissões, progresso e publicação de conteúdo.
- O serviço não publica porta no host. Somente a API da plataforma o alcança
  pelas redes Docker privadas `ia50_private` e `litellm_litellm_internal`.
- `IA50_INTERNAL_MODE=true` exige um bearer token dedicado e falha fechado se
  o segredo estiver ausente ou tiver menos de 32 caracteres. Não existe
  cadastro paralelo no OpenMAIC.
- Mesmo com bearer válido, somente saúde, geração, persistência e mídia de
  salas são alcançáveis. Páginas e APIs upstream de busca, chat, proxy, imagem,
  vídeo, TTS, exportação ou configuração retornam `404`.
- A sala tem somente Clara como professora, sem colegas de IA permanentes.
- Busca web, geração de imagem/vídeo, TTS de servidor, renderização MP4 e
  provedores locais pesados ficam desligados.
- Rascunhos de aula são gerados na área administrativa, revisados por pessoa
  autorizada e importados pela plataforma. A experiência do aluno usa apenas
  conteúdo previamente aprovado.
- O OpenMAIC conhece somente o modelo lógico `tutor-50plus`. A chave principal
  do OpenRouter permanece no LiteLLM, fora deste contêiner.

## Execução

Use `deploy/ia50/compose.yml`. Os arquivos
`openmaic_internal_token` e `openmaic_litellm_api_key` devem existir no
diretório externo informado por `IA50_SECRETS_DIR`, com permissões restritas.
Não copie valores para Git, para a imagem ou para logs.

O volume `openmaic-data` contém apenas rascunhos administrativos. Antes de
qualquer dado crítico entrar em produção, configure backup off-site e execute
um teste de restauração isolado.

## Atualizações do upstream

1. Crie uma branch a partir de uma tag assinada/release revisada.
2. Registre tag, commit, licença e mudanças de dependências.
3. Reaplique este pequeno patch de isolamento e professora única.
4. Rode testes, build, SBOM, varredura de vulnerabilidades e smoke isolado.
5. Promova somente uma imagem fixada por digest e mediante change control.

Nunca faça merge automático de `upstream/main` em produção.
