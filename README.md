# MetFlix

Aplicação full stack inspirada na experiência da Netflix: autenticação, seleção de perfis (até 4 por conta), catálogo de filmes/séries, player e progresso de reprodução.

Este projeto não é afiliado à Netflix.

## Funcionalidades

- Login e cadastro (JWT)
- Perfis por conta (máximo 4) + seleção de avatar
- Catálogo de filmes e séries
- Progresso de reprodução (filmes e episódios)
- Admin: adicionar/editar conteúdo e reordenar itens

## Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Flask + SQLAlchemy + JWT
- Banco: SQLite (padrão)

## Como rodar localmente

### Pré-requisitos

- Node.js 18+ (recomendado)
- Python 3.10+ (recomendado)

### 1) Backend

```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r backend/requirements.txt
python backend/app.py
```

Servidor padrão:

- API: http://localhost:5000/api

Variáveis de ambiente (opcionais):

- DATABASE_URL: string de conexão do SQLAlchemy (padrão: sqlite:///cinehub.db)
- JWT_SECRET_KEY: segredo do JWT
- VIDEO_DIR: diretório base de vídeos (padrão: ./videos)

### 2) Frontend

```bash
npm install
npm run dev
```

Servidor padrão:

- Web: http://localhost:5173

Variáveis de ambiente (opcionais):

- VITE_API_URL: URL completa da API (ex.: http://localhost:5000/api)
- VITE_API_PORT: porta do backend (padrão: 5000)

## Perfis e avatares

- A conta pode ter até 4 perfis.
- Para adicionar avatares, coloque PNGs em: src/assets/profile-avatars
- Formato recomendado: PNG quadrado (1:1), 512×512 px (mínimo 256×256 px).

## Admin (opcional)

Existe um script de utilidade para criar um usuário admin local:

```bash
python create_admin.py
```

Use apenas para desenvolvimento local e altere as credenciais antes de publicar ou usar em produção.

## Build

```bash
npm run build
```

O build do frontend vai para a pasta dist/.

## Licença

MIT. Veja [LICENSE](./LICENSE).

## Atribuições

Veja [ATTRIBUTIONS.md](./ATTRIBUTIONS.md).
