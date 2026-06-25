# KARD 🃏

Jeu de cartes multijoueur en temps réel, inspiré des règles du jeu UNO. Jouable en réseau local ou en ligne via Railway.

## Demo en ligne

🌐 **https://kard-game-production.up.railway.app**

## Fonctionnalités

- 🏠 Salons avec code à 5 lettres — jusqu'à 10 joueurs
- 🃏 Deck complet : chiffres 0–9, Skip, Reverse, +2, Joker, Joker +4
- ⚡ Temps réel via Socket.io — aucun rechargement de page
- 🔌 Reconnexion automatique — 30 secondes de grâce en cas de coupure
- 📢 Bouton KARD! + système anti-bluff (choper quelqu'un qui oublie)
- 🎨 Table ronde visuelle avec cartes dos retourné pour les adversaires

## Stack technique

| Côté | Techno |
|------|--------|
| Serveur | Node.js + Express |
| Temps réel | Socket.io |
| Frontend | HTML / CSS / JS vanilla |
| Hébergement | Railway |

## Lancer en local

```bash
npm install
npm start
```

Ouvre `http://localhost:3000` dans ton navigateur.

Pour jouer en réseau local, les autres joueurs utilisent ton IP locale :

```
ipconfig   # trouve ton "Adresse IPv4"
# ex: http://192.168.1.42:3000
```

## Structure du projet

```
kard-game/
├── server.js        # Serveur Node.js + logique du jeu
├── package.json
└── public/
    ├── index.html   # Interface du jeu
    ├── style.css    # Design
    └── game.js      # Logique client
```

## Règles du jeu

Joue une carte qui correspond à la couleur ou à la valeur de la carte du dessus. Le premier à vider sa main gagne. N'oublie pas d'appuyer sur **KARD!** quand il te reste une seule carte.
