# FERZU POS — Git Flow (configurar una sola vez)

## 1. Crear rama `staging` y configurar Vercel

```bash
git checkout -b staging
git push origin staging
```

En **Vercel** → Settings → Git:
- Production Branch: `main`
- Preview Branch: agrega `staging`

Ahora cada PR hacia `staging` genera una URL de preview automática.

## 2. Proteger `main` en GitHub

GitHub → Settings → Branches → Add rule → `main`:
- ✅ Require a pull request before merging
- ✅ Do not allow bypassing the above settings

**Nadie pushea directo a `main` jamás.** Solo merges desde `staging`.

## 3. Flujo diario (reemplaza los .bat de emergencia)

```bash
# Siempre desde staging actualizado
git checkout staging
git pull origin staging

# Crear rama para el fix o feature
git checkout -b fix/descripcion-clara
# -- trabajas --

# Cuando terminas
git add -A
git commit -m "fix: descripción del problema que resuelve, no qué hiciste"
git push origin fix/descripcion-clara
```

Luego en GitHub: **PR de `fix/...` → `staging`**
- Revisa el diff en la PR
- Verifica la URL de preview de Vercel
- Si todo OK → merge

Cuando `staging` está estable: **PR de `staging` → `main`** = deploy a producción.

## 4. Convención de nombres de rama

| Tipo       | Prefijo         | Ejemplo                          |
|------------|-----------------|----------------------------------|
| Bug fix    | `fix/`          | `fix/branch-selector-rls`        |
| Feature    | `feat/`         | `feat/dashboard-kpis`            |
| Refactor   | `refactor/`     | `refactor/split-auth-screens`    |
| Hotfix     | `hotfix/`       | `hotfix/login-loop-prod`         |

## 5. Convención de commits (una sola línea, imperativa)

```
fix: descripción — qué problema resuelve
feat: descripción — qué capacidad agrega
refactor: descripción — qué se limpió
chore: descripción — infraestructura, deps, configs
```

## 6. Herramienta única de git

Usa **solo VS Code Source Control** (panel izquierdo). Cierra GitHub Desktop para este repo.
Tener dos herramientas escribiendo en `.git` simultáneamente causa `index.lock`.

Si aparece `index.lock` (solo cuando git está inactivo):
```bash
del .git\index.lock
```
