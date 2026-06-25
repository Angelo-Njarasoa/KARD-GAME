# Packages installés — KARD Game

## Dépendances directes (installées par nous)

| Package | Version | Rôle |
|---|---|---|
| `express` | ^4.18.2 | Serveur HTTP, sert les fichiers HTML/CSS/JS |
| `socket.io` | ^4.7.2 | Communication temps réel entre serveur et joueurs |

Ces 2 packages sont dans `package.json`. Tout le reste est installé automatiquement par eux.

---

## Dépendances indirectes (installées automatiquement)

Ce sont les sous-dépendances d'Express et Socket.io. Tu n'as jamais à les toucher.

### Liées à Express
```
accepts
array-flatten
body-parser
bytes
content-disposition
content-type
cookie
cookie-signature
debug
depd
destroy
ee-first
encodeurl
escape-html
etag
finalhandler
forwarded
fresh
http-errors
iconv-lite
inherits
media-typer
merge-descriptors
methods
mime
mime-db
mime-types
ms
negotiator
on-finished
parseurl
path-to-regexp
proxy-addr
qs
range-parser
raw-body
safe-buffer
safer-buffer
send
serve-static
setprototypeof
statuses
toidentifier
type-is
unpipe
utils-merge
vary
```

### Liées à Socket.io
```
@socket.io/component-emitter
@types/cookie
base64id
cors
engine.io
engine.io-parser
socket.io-adapter
socket.io-parser
ws
```

### Utilitaires JavaScript internes
```
call-bind-apply-helpers
call-bound
dunder-proto
es-define-property
es-errors
es-object-atoms
function-bind
get-intrinsic
get-proto
gopd
has-symbols
hasown
math-intrinsics
object-assign
object-inspect
side-channel
side-channel-list
side-channel-map
side-channel-weakmap
undici-types
ipaddr.js
```

---

## Comment faire un reset complet

### Option 1 — Reset simple (recommandé)
Supprime juste le dossier `node_modules` et réinstalle :
```
cd C:\Users\Utilisateur\Desktop\uno-game
rmdir /s /q node_modules
npm install
```

### Option 2 — Reset total
Supprime `node_modules` ET `package-lock.json`, puis réinstalle :
```
cd C:\Users\Utilisateur\Desktop\uno-game
rmdir /s /q node_modules
del package-lock.json
npm install
```

### Option 3 — Réinstaller un package spécifique
```
npm uninstall express
npm install express

npm uninstall socket.io
npm install socket.io
```

---

## Packages installés globalement (sur tout le PC)

Ces packages ne sont PAS dans `node_modules` du projet mais sur ta machine :

| Package | Rôle |
|---|---|
| `@railway/cli` | Déployer sur Railway depuis le terminal |

Pour le désinstaller : `npm uninstall -g @railway/cli`

---

## Total

- **2 packages** installés par nous
- **90 packages** installés automatiquement
- **1 package global** (Railway CLI)
