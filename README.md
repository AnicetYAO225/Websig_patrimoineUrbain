# 🗺️ WebSIG — Gestion du Patrimoine Urbain

Plateforme WebSIG complète pour la gestion géographique du patrimoine
urbain d'une collectivité : bâtiments publics, voirie, éclairage, espaces
verts, points de collecte des déchets, arrêts de bus...

**Stack** : FastAPI · PostgreSQL/PostGIS · SQLAlchemy · GeoAlchemy2 · Alembic · JWT
· React · TypeScript · Tailwind CSS · Vite · **MapLibre GL** (carte vectorielle) · Terra Draw (dessin)

> ✅ Ce projet a été testé de bout en bout (migrations, authentification,
> RBAC, requêtes spatiales PostGIS, intégration frontend↔backend avec
> CORS) avant livraison — pas seulement écrit, mais exécuté et vérifié.

---

## Table des matières

1. [Architecture](#1-architecture)
2. [Prérequis](#2-prérequis)
3. [Installation pas à pas (sans Docker)](#3-installation-pas-à-pas-sans-docker)
4. [Installation avec Docker](#4-installation-avec-docker)
5. [Structure du projet et rôle de chaque fichier](#5-structure-du-projet-et-rôle-de-chaque-fichier)
6. [Comment se connecter](#6-comment-se-connecter)
7. [Référence API](#7-référence-api)
8. [Tests automatisés (backend)](#8-tests-automatisés-backend)
9. [Dépannage (erreurs fréquentes)](#9-dépannage-erreurs-fréquentes)
10. [Sécurité avant mise en production](#10-sécurité-avant-mise-en-production)
11. [Pistes d'évolution](#11-pistes-dévolution)

---

## 1. Architecture

```
┌───────────────────────────┐
│   FRONTEND (React + TS)    │  Vite · Tailwind · React Router · Leaflet
│   port 5173 (dev)           │
└─────────────┬───────────────┘
              │ REST API (JSON + JWT)
              ▼
┌───────────────────────────┐
│         FASTAPI              │  Auth JWT · RBAC · CRUD couches/objets
│   port 8000                  │
└─────────────┬───────────────┘
              │ SQLAlchemy + GeoAlchemy2
              ▼
┌───────────────────────────┐
│   POSTGRESQL + POSTGIS       │  users · layers · features (geom + JSONB)
│   port 5432                  │
└───────────────────────────┘
```

### Modèle de données : `Layer` / `Feature`

Plutôt qu'une table par type d'équipement (`buildings`, `roads`,
`street_lights`...), le projet utilise un modèle **générique et
évolutif** :

- **`layers`** décrit une couche (nom, type de géométrie, visibilité...)
- **`features`** contient les objets géographiques de cette couche :
  - `geom` : colonne géométrique PostGIS (indexée en **GIST**)
  - `properties` : champ **JSONB** libre (attributs métier : état, date
    d'installation, code...)

Ajouter une nouvelle couche métier (ex. "Bornes incendie") se fait
**depuis l'interface Admin, sans aucune migration de base de données**.

### RBAC (rôles)

| Rôle          | Droits                                                           |
| ------------- | ---------------------------------------------------------------- |
| `SUPER_ADMIN` | Tout, y compris attribuer/retirer des rôles                      |
| `ADMIN`       | Gestion des utilisateurs, des couches, des données               |
| `AGENT`       | Ajoute/modifie/supprime des objets géographiques (agent terrain) |
| `CITIZEN`     | Consultation de la carte uniquement (lecture seule)              |

---

## 2. Prérequis

| Outil                               | Version conseillée | Vérifier avec                              |
| ----------------------------------- | ------------------ | ------------------------------------------ |
| Python                              | 3.11+              | `python3 --version`                        |
| Node.js                             | 20+                | `node --version`                           |
| PostgreSQL                          | 14+                | `psql --version`                           |
| Extension PostGIS                   | 3.x                | (installée avec `postgresql-XX-postgis-3`) |
| Docker + Docker Compose (optionnel) | récent             | `docker --version`                         |

Tes identifiants PostgreSQL utilisés dans ce guide :

```
Base de données : websig_patrimoine
Utilisateur      : postgres
Mot de passe      : anicet94
Hôte / Port       : 192.168.64.1 / 5432
```

---

## 3. Installation pas à pas (sans Docker)

### Étape 1 — Créer la base de données PostgreSQL/PostGIS

```bash
sudo -u postgres psql

-- Dans le prompt psql :
ALTER USER postgres WITH PASSWORD 'anicet94';
CREATE DATABASE websig_patrimoine OWNER postgres;
\c websig_patrimoine
CREATE EXTENSION IF NOT EXISTS postgis;
\q
```

Si l'extension PostGIS n'est pas installée :

```bash
# Ubuntu / Debian
sudo apt-get install postgresql-16-postgis-3   # adapter "16" à ta version de PostgreSQL

# macOS (Homebrew)
brew install postgis
```

### Étape 2 — Backend (FastAPI)

```bash
cd backend

# 1. Créer et activer un environnement virtuel Python
python3 -m venv venv
source venv/bin/activate          # Windows : venv\Scripts\activate

# 2. Installer les dépendances
pip install -r requirements.txt
pip install -r requirements-dev.txt

# 3. Configurer les variables d'environnement
.env
# .env.example est déjà pré-rempli avec tes identifiants
# (websig_patrimoine / postgres / anicet94 / localhost). Vérifie-le si besoin.

# 4. Appliquer les migrations (crée les tables + l'extension PostGIS si besoin)
alembic revision --autogenerate -m "add style_config to layers"
alembic upgrade head
alembic revision --autogenerate -m "widen source_date"
alembic revision --autogenerate -m "add feature_history table"
alembic upgrade head

# 5. Créer le compte super admin (aucune donnée de démonstration n'est créée)
python -m app.seed

# 6. Importer les données réelles (Saint-Étienne Métropole)
python -m app.import_geodata

# 7. Démarrer le serveur de développement
uvicorn app.main:app --reload
```

Backend disponible sur **http://localhost:8000**
(doc interactive Swagger : http://localhost:8000/docs).

> Laisse ce terminal ouvert. Ouvre un **second terminal** pour le frontend.

### À propos des données réelles (`app/import_geodata.py`)

`seed.py` ne crée plus que le compte super admin — plus aucune couche
fictive. Les vraies données territoriales se chargent via
`app/import_geodata.py`, qui lit les fichiers GeoJSON de `backend/data/` :

- **Saint-Étienne Métropole** (EPCI) : contour administratif, avec
  population et superficie calculées à partir des communes membres
- **Communes de Saint-Étienne Métropole** : les 53 communes membres,
  avec code INSEE, population, département, région

Chaque couche importée conserve sa **source**, sa **date** et sa
**licence** (visibles via l'API `/api/layers`), conformément à la
traçabilité attendue pour des données territoriales officielles.
D'autres jeux de données viendront enrichir ce script au fur et à
mesure qu'ils seront fournis.

> **Installation existante avec les anciennes données de démo ?**
> `python -m app.purge_demo_data` supprime les couches fictives
> (bâtiments, routes, éclairage...) sans toucher aux vraies données.

> **Installation existante avec l'ancien compte super admin
> (`admin@mairie-demo.fr`) ?** Mets à jour `FIRST_SUPERADMIN_EMAIL` et
> `FIRST_SUPERADMIN_PASSWORD` dans `.env`, puis relance `python -m
app.seed` : il crée le nouveau compte sans toucher à l'ancien (`seed.py`
> est idempotent, il ne fait que vérifier/créer). Supprime ensuite
> l'ancien compte depuis la page **Administration** (réservée
> Super administrateur).

### Étape 3 — Frontend (React)

### enlever

```bash
cd frontend

# 1. Installer les dépendances Node
npm install
npm install @turf/turf

# 2. Configurer l'URL de l'API
.env # Par défaut : VITE_API_URL=http://localhost:8000 (déjà correct)

# 3. Démarrer le serveur de développement
npm run dev
```

Frontend disponible sur **http://localhost:5173**.

### Étape 4 — Se connecter

Ouvre **http://localhost:5173** → écran de connexion, déjà pré-rempli
avec le compte créé par le seed :

- **Email** : `yao.anicet36@gmail.com`
- **Mot de passe** : `Stephen.curry94@`

---

## 4. Installation avec Docker

Alternative si tu as Docker installé (⚠️ démarre une **base PostgreSQL
neuve dans un conteneur**, distincte de ton installation locale) :

```bash
cp .env.example .env
docker compose up --build -d

docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed
docker compose exec backend python -m app.import_geodata
```

- API : http://localhost:8000/docs
- Frontend : http://localhost:8080

Pour arrêter : `docker compose down` (ajoute `-v` pour aussi supprimer
les données de la base).

---

## 5. Structure du projet et rôle de chaque fichier

```
websig-patrimoine/
├── docker-compose.yml
├── .env.example
├── backend/
│   └── data/                       Fichiers GeoJSON sources pour import_geodata.py
└── frontend/
```

### 5.1 Backend (`backend/`)

```
backend/
├── requirements.txt          Dépendances Python (versions figées)
├── requirements-dev.txt       + pytest, httpx (tests uniquement)
├── pytest.ini                  Config pytest (chemin des tests, warnings)
├── Dockerfile                 Image Docker du backend (docker-compose)
├── alembic.ini                 Config Alembic
├── data/                        Fichiers GeoJSON réels (voir app/import_geodata.py)
│   ├── epci_saint_etienne_metropole.geojson
│   └── communes_saint_etienne_metropole.geojson
├── alembic/
│   ├── env.py                    Connecte les migrations à settings.DATABASE_URL
│   │                              et aux modèles SQLAlchemy
│   ├── script.py.mako             Template pour générer une nouvelle migration
│   └── versions/
│       ├── 0001_initial.py         Migration initiale : extension PostGIS +
│       │                            tables users, layers, features + index GIST
│       ├── 0002_add_avatar_url.py   Colonne avatar_url sur users
│       └── 0003_layer_source_metadata.py  Colonnes source/source_date/license sur layers
├── tests/                        Suite de tests automatisés (pytest)
│   ├── conftest.py                 Base de test isolée, fixtures client/db_session
│   ├── test_auth.py                Inscription, connexion, /me
│   ├── test_layers.py              CRUD des couches + RBAC
│   ├── test_features.py            CRUD GeoJSON + RBAC + validation géométrie
│   ├── test_admin.py                Gestion utilisateurs + RBAC des rôles
│   └── test_profile.py              Mise à jour profil, mot de passe, avatar
└── app/
    ├── main.py                     Point d'entrée FastAPI : crée l'app, CORS,
    │                                 sert /media (avatars), monte les routers
    ├── seed.py                      Script à lancer une fois : crée uniquement
    │                                 le compte super admin (aucune donnée fictive)
    ├── purge_demo_data.py            Supprime les anciennes couches de démo d'une
    │                                 installation existante, sans toucher aux vraies données
    ├── promote_to_superadmin.py       Outil de secours : promeut un compte existant en
    │                                 SUPER_ADMIN par email (voir section dépannage)
    ├── import_geodata.py            Import des vraies données territoriales
    │                                 (Saint-Étienne Métropole + communes)
    │
    ├── core/
    │   ├── config.py                 Variables d'environnement (Pydantic Settings)
    │   ├── database.py                Connexion SQLAlchemy + dependency get_db()
    │   └── security.py                Hash bcrypt + génération/vérification JWT
    │
    ├── models/                        Tables de la base (SQLAlchemy ORM)
    │   ├── user.py                     users : username, email, password, role, avatar
    │   ├── layer.py                    layers : nom, type de géométrie, slug, source...
    │   ├── feature.py                  features : geom (PostGIS) + properties (JSONB)
    │   └── __init__.py                 Importe tous les modèles (requis Alembic)
    │
    ├── schemas/                        Schémas Pydantic (validation entrée/sortie API)
    │   ├── auth.py                       UserRegister/Login, Token, UserOut,
    │   │                                   ProfileUpdate, PasswordChange
    │   ├── user.py                       UserUpdateRole, UserUpdateStatus
    │   ├── layer.py                      LayerCreate, LayerUpdate, LayerOut
    │   └── feature.py                    FeatureCreate/Update basés sur GeoJSON
    │
    ├── api/                             Routes HTTP
    │   ├── deps.py                       get_current_user (décode JWT) et
    │   │                                   require_roles(...) (RBAC)
    │   ├── auth.py                       register, login, /me (+ avatar, password)
    │   ├── admin.py                      Gestion utilisateurs — ADMIN/SUPER_ADMIN
    │   ├── layers.py                     CRUD des couches SIG
    │   └── features.py                   CRUD objets géographiques (GeoJSON), ?bbox=
    │
    └── services/                        Logique métier réutilisable
        ├── auth_service.py                Création utilisateur, vérif. identifiants
        ├── media_service.py                Validation/sauvegarde des avatars uploadés
        └── gis_service.py                 Conversions géométrie PostGIS <-> GeoJSON
```

### 5.2 Frontend (`frontend/`)

```
frontend/
├── package.json                Dépendances Node + scripts (dev, build, preview)
├── vite.config.ts               Config Vite : plugin React + plugin Tailwind v4
├── tsconfig*.json                Config TypeScript (stricte)
├── Dockerfile                    Build multi-stage : compile React puis sert via Nginx
├── nginx.conf                    Fallback SPA pour React Router
├── index.html                    Page HTML racine, charge src/main.tsx
├── .env.example                  VITE_API_URL (à copier en .env)
└── src/
    ├── main.tsx                   Monte <App /> dans le DOM, charge le CSS global
    ├── App.tsx                    Déclare toutes les routes + leurs protections
    ├── index.css                  Tailwind + design tokens (couleurs, polices, "cartouche")
    │
    ├── types/
    │   └── index.ts                 Types TS partagés (miroir des schémas Pydantic)
    │
    ├── lib/
    │   ├── roles.ts                  Libellés humains des rôles (SUPER_ADMIN -> "Super
    │   │                               administrateur"...), jamais la valeur brute affichée
    │   ├── avatar.ts                 Construit l'URL absolue d'un avatar + initiales
    │   ├── slugify.ts                 Transforme un nom en identifiant technique (slug)
    │   ├── geo.ts                     Centre approximatif d'une géométrie (pour "flyTo")
    │   └── errors.ts                  Normalise les erreurs API (gère le format tableau
    │                                   des erreurs de validation Pydantic/FastAPI)
    │
    ├── api/                         Un fichier par ressource, appelle le backend
    │   ├── client.ts                  Instance axios : injecte le JWT automatiquement,
    │   │                                déconnecte si le token est expiré (401)
    │   ├── auth.ts                    login(), register(), profil, mot de passe, avatar
    │   ├── layers.ts                  listLayers(), createLayer(), updateLayer()...
    │   ├── features.ts                listFeatures(), createFeature(), importFeatures()...
    │   └── users.ts                   listUsers(), updateUserRole(), deleteUser()
    │
    ├── context/
    │   └── AuthContext.tsx            État global d'authentification, hook useAuth()
    │
    ├── components/
    │   ├── Layout.tsx                  Barre du haut + sidebar navigation (pages protégées)
    │   ├── AuthShell.tsx                Mise en page commune Login/Register/ForgotPassword
    │   ├── Panel.tsx                    Cartouche, SectionLabel, KpiRow — briques du
    │   │                                 système de design réutilisées partout
    │   ├── MapCanvas.tsx                Carte MapLibre GL : sources/couches GeoJSON,
    │   │                                 popups, intégration du dessin (terra-draw)
    │   ├── ImportGeoJSONPanel.tsx       Glisser-déposer un GeoJSON, aperçu détecté,
    │   │                                 métadonnées, création de couche + import en masse
    │   ├── FeaturePropertiesModal.tsx   Formulaire de saisie des attributs après un dessin
    │   ├── ProtectedRoute.tsx          Redirige vers /login si non connecté
    │   └── RoleGuard.tsx               Cache un élément si le rôle ne correspond pas
    │
    └── pages/
        ├── LoginPage.tsx               Écran de connexion
        ├── RegisterPage.tsx            Inscription publique (rôle CITIZEN)
        ├── ForgotPasswordPage.tsx      Mot de passe oublié (oriente vers un admin)
        ├── DashboardPage.tsx           Indicateurs clés + détail par couche
        ├── MapPage.tsx                 Carte MapLibre GL, couches à cocher, dessin d'objets
        ├── LayersPage.tsx              Gestion des couches (liste + création + suppr.)
        ├── AdminUsersPage.tsx          Utilisateurs : recherche, filtre, rôles, pagination
        ├── ProfilePage.tsx             Photo de profil, informations, mot de passe
        └── NotFoundPage.tsx            Page 404
```

**Comment une page fonctionne** (exemple `MapPage.tsx`) :

1. Au chargement, appelle `layersApi.listLayers()` puis, pour chaque
   couche, `featuresApi.listFeatures(layer.id)`
2. Ces fonctions vivent dans `api/`, qui utilise `apiClient` (axios)
   configuré dans `api/client.ts`
3. Le token JWT est injecté automatiquement par l'intercepteur axios
4. Les données GeoJSON reçues sont passées à `<MapCanvas layers={...} />`,
   qui les affiche comme sources/couches MapLibre GL natives

### Carte : fonds de plan et recherche

`MapCanvas.tsx` définit son propre style MapLibre (pas de `style.json`
externe à charger) avec deux fonds superposés, basculables sans recharger
la carte (bouton en haut à droite) :

- **Plan** — tuiles CARTO Positron (`basemaps.cartocdn.com`), gratuites,
  sans clé, données OpenStreetMap
- **Satellite** — imagerie Esri World Imagery, gratuite, sans clé

⚠️ Les tuiles OpenStreetMap "brutes" (`tile.openstreetmap.org`) ne
renvoient **pas** d'en-têtes CORS : MapLibre GL (rendu WebGL) ne peut pas
les utiliser comme texture et le fond de carte reste vide. C'est pour
cette raison que CARTO est utilisé à la place — il sert les mêmes
données OpenStreetMap, mais correctement configuré pour cet usage. Pour
changer de fournisseur, modifie la constante `MAP_STYLE` en tête du
fichier (en gardant un fournisseur qui supporte CORS pour du raster/WebGL).

**Recherche d'objets** (`MapPage.tsx`) : la barre de recherche filtre en
temps réel les propriétés `nom`/`name`/`libelle` de tous les objets des
couches chargées (ex: trouver une commune par son nom) et centre la
carte sur le résultat sélectionné (`MapCanvas` expose `flyTo(lng, lat)`
via une ref).

---

## 6. Comment se connecter

### Interface web (React)

http://localhost:5173, champs pré-remplis :

- Email : `yao.anicet36@gmail.com`
- Mot de passe : `Stephen.curry94@`

### Swagger

http://localhost:8000/docs → **Authorize** (🔓) → `username` =
`yao.anicet36@gmail.com`, `password` = `Stephen.curry94@`

### En ligne de commande

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -d "username=yao.anicet36@gmail.com&password=Stephen.curry94@" \
  -H "Content-Type: application/x-www-form-urlencoded"
```

---

## 7. Référence API

Toutes les routes (sauf `/register`, `/login`, `/health`) nécessitent
`Authorization: Bearer <token>`.

### Authentification

| Méthode | Route                | Description                                    |
| ------- | -------------------- | ---------------------------------------------- |
| POST    | `/api/auth/register` | Inscription publique (rôle CITIZEN par défaut) |
| POST    | `/api/auth/login`    | Connexion → retourne un JWT                    |
| GET     | `/api/auth/me`       | Profil de l'utilisateur connecté               |

### Administration (ADMIN / SUPER_ADMIN)

| Méthode | Route                          | Description                                 |
| ------- | ------------------------------ | ------------------------------------------- |
| GET     | `/api/admin/users`             | Liste des utilisateurs                      |
| PUT     | `/api/admin/users/{id}/role`   | Change le rôle (SUPER_ADMIN uniquement)     |
| PUT     | `/api/admin/users/{id}/status` | Active/désactive un compte                  |
| DELETE  | `/api/admin/users/{id}`        | Supprime un compte (SUPER_ADMIN uniquement) |

### Couches SIG

| Méthode | Route              | Rôles  |
| ------- | ------------------ | ------ |
| GET     | `/api/layers`      | tous   |
| POST    | `/api/layers`      | ADMIN+ |
| PUT     | `/api/layers/{id}` | ADMIN+ |
| DELETE  | `/api/layers/{id}` | ADMIN+ |

### Objets géographiques (GeoJSON)

| Méthode | Route                              | Rôles                                              |
| ------- | ---------------------------------- | -------------------------------------------------- |
| GET     | `/api/layers/{id}/features`        | tous — accepte `?bbox=minLon,minLat,maxLon,maxLat` |
| POST    | `/api/layers/{id}/features`        | AGENT+                                             |
| POST    | `/api/layers/{id}/features/import` | ADMIN+ — import en masse d'un fichier GeoJSON      |
| PUT     | `/api/features/{id}`               | AGENT+                                             |
| DELETE  | `/api/features/{id}`               | AGENT+                                             |

**Import en masse** : accepte un fichier `.geojson` (`FeatureCollection`) en
`multipart/form-data`. Les objets dont la géométrie est incompatible avec
la couche sont ignorés individuellement (pas d'échec global), et
répertoriés dans la réponse :

```json
{
  "imported_count": 52,
  "skipped_count": 1,
  "errors": ["Objet #4 ignoré : ..."]
}
```

Une même couche "Polygon" accepte aussi les `MultiPolygon` (et de même pour
`LineString`/`MultiLineString`, `Point`/`MultiPoint`) — un même jeu de
données réel mélange souvent les deux (ex: une commune avec une enclave).

### Importer de nouvelles données depuis l'interface

Page **Couches** (`/layers`, réservée ADMIN+) → bouton **"Importer des
données"** :

1. Dépose ou sélectionne un fichier `.geojson`
2. L'aperçu détecte automatiquement le nombre d'objets, le type de
   géométrie et les attributs présents
3. Complète les métadonnées (nom, description, **source**, **date**,
   **licence** — cette traçabilité est enregistrée sur la couche)
4. Valide : la couche est créée puis tous ses objets importés en un seul
   appel, avec un résumé (objets importés / ignorés, détail des erreurs)

Aucun script à écrire : c'est le flux à utiliser pour toute nouvelle
donnée réelle (patrimoine, bâtiments, voirie...) plutôt que
`app/import_geodata.py`, qui reste utile pour des imports automatisés
(CI, ré-exécution reproductible) plutôt que ponctuels.

---

## 8. Tests automatisés (backend)

La suite `backend/tests/` (26 tests) couvre l'authentification, le RBAC,
le CRUD des couches/objets géographiques, l'administration et le profil.
Elle tourne sur une **base PostgreSQL dédiée**, distincte de celle de
développement, pour ne jamais toucher à tes données réelles.

```bash
# Créer une base de test (une seule fois)
sudo -u postgres psql -c "CREATE DATABASE websig_patrimoine_test OWNER postgres;"
sudo -u postgres psql -d websig_patrimoine_test -c "CREATE EXTENSION IF NOT EXISTS postgis;"

cd backend
source venv/bin/activate
pip install -r requirements-dev.txt

pytest              # lance toute la suite
pytest -v           # avec le détail de chaque test
pytest --cov=app    # avec la couverture de code
```

Par défaut, les tests se connectent à
`postgresql+psycopg2://postgres:anicet94@localhost:5432/websig_patrimoine_test`
(variable `DATABASE_URL`, surchageable via l'environnement).

---

## 9. Dépannage (erreurs fréquentes)

| Symptôme                                                                                          | Cause probable                                                                                                                                                                                      | Solution                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `password authentication failed for user "postgres"`                                              | Mot de passe différent de `.env`                                                                                                                                                                    | Vérifie `ALTER USER postgres WITH PASSWORD 'anicet94';`                                                                                                                                                                                                     |
| `extension "postgis" is not available`                                                            | PostGIS non installé                                                                                                                                                                                | `sudo apt-get install postgresql-XX-postgis-3`                                                                                                                                                                                                              |
| Erreur bcrypt (`module 'bcrypt' has no attribute '__about__'`)                                    | Incompatibilité passlib/bcrypt                                                                                                                                                                      | Déjà fixé (`bcrypt==4.0.1`) ; sinon `pip install bcrypt==4.0.1`                                                                                                                                                                                             |
| `Network Error` côté frontend                                                                     | Backend arrêté ou mauvaise URL                                                                                                                                                                      | Vérifie uvicorn (port 8000) et `frontend/.env`                                                                                                                                                                                                              |
| Connexion refusée avec "Email ou mot de passe incorrect" **alors que les identifiants sont bons** | Corrigé : avant, ce message s'affichait aussi quand le frontend n'arrivait pas du tout à joindre le backend. Le message précise maintenant la vraie cause ("Impossible de contacter le serveur...") | Vérifie que `uvicorn` tourne, que `frontend/.env` pointe vers la bonne URL (`VITE_API_URL`), et regarde l'onglet Réseau du navigateur (F12)                                                                                                                 |
| Impossible de créer un compte, rien ne se passe visiblement                                       | Le navigateur bloque déjà nativement les mots de passe < 8 caractères / noms < 3 caractères avant même d'appeler l'API                                                                              | Vérifie ces contraintes ; sinon regarde le message d'erreur affiché (désormais lisible même pour les erreurs de validation du serveur, ex: email déjà utilisé)                                                                                              |
| Erreur CORS console navigateur                                                                    | Origine non autorisée                                                                                                                                                                               | `allow_origins=["*"]` en dev dans `app/main.py`, redémarrer le backend                                                                                                                                                                                      |
| `relation "users" does not exist`                                                                 | Migrations non appliquées                                                                                                                                                                           | `alembic upgrade head` depuis `backend/`                                                                                                                                                                                                                    |
| Modèle changé mais table pas à jour                                                               | Pas de sync auto                                                                                                                                                                                    | `alembic revision --autogenerate -m "..."` puis `alembic upgrade head`                                                                                                                                                                                      |
| `TypeError: ufunc 'create_collection' not supported...` en traitant un GeoJSON                    | `shapely` trop ancien pour `numpy` 2.x                                                                                                                                                              | `pip install -U "shapely>=2.0.6"` (déjà fixé dans `requirements.txt`)                                                                                                                                                                                       |
| Connecté avec les identifiants du super admin mais rôle affiché = CITOYEN                         | Ce compte a été créé via "Créer un compte" (auto-inscription = toujours CITOYEN) avant que `seed.py` ne le crée en SUPER_ADMIN                                                                      | `python -m app.seed` (promeut désormais automatiquement un compte existant portant l'email `FIRST_SUPERADMIN_EMAIL`) ; ou en dernier recours `python -m app.promote_to_superadmin ton@email.com`                                                            |
| Le fond de carte s'affiche mais pas les couches (ou l'inverse)                                    | Une couche a pu échouer à charger sans bloquer les autres (déjà rendu résilient), ou une tuile de fond a échoué                                                                                     | Ouvre la console navigateur (F12) : les erreurs sont maintenant explicitement loguées (`Erreur MapLibre :` / `Impossible d'afficher la couche...` / `Impossible de charger...`). Fais un rechargement forcé (Ctrl+Maj+R) pour écarter un bundle JS en cache |
| La carte reste blanche (ni fond de carte, ni objets)                                              | Corrigé dans le code (initialisation `terra-draw` qui bloquait l'affichage) — si ça persiste : bloqueur de pub/extension qui bloque `tiles.openfreemap.org`, ou pare-feu réseau                     | Vérifie la console navigateur (F12) ; désactive temporairement les extensions ; teste `https://tiles.openfreemap.org/styles/liberty` directement dans un onglet                                                                                             |

---

## 10. Sécurité avant mise en production

- [ ] Générer une vraie `SECRET_KEY` (`openssl rand -hex 32`), hors du repo Git
- [ ] Changer le mot de passe du compte super admin par défaut
- [ ] Restreindre `allow_origins` du CORS au(x) domaine(s) réel(s) du frontend
- [ ] Retirer `--reload` du Dockerfile backend en production
- [ ] Ne pas exposer le port 5432 publiquement
- [ ] Servir le frontend en HTTPS ; cookie `httpOnly` plutôt que `localStorage` pour le JWT
- [ ] Rate limiting sur `/api/auth/login`

## 11. Pistes d'évolution

- Historique des modifications (table d'audit / versioning des objets)
- Import/export Shapefile & GeoPackage
- Recherche spatiale avancée (rayon, intersection entre couches)
- WMS/WFS via GeoServer pour interopérabilité avec QGIS
- Notifications lors du signalement d'une anomalie par un citoyen
- Tests automatisés (pytest côté backend, Vitest côté frontend)

apporte ces améliorations:  
 Possible qu'il soit aussi un outil de terrain (mettre le données directement depuis le terrain avec les coordonnées). aussi affiché les statistiques en fonction des données integré par rapport à la communes ( ratio, stats)
