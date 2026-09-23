# WebSIG - Gestion du patrimoine urbain

WebSIG est une application web permettant de gérer et de visualiser des données géographiques liées au patrimoine d'une collectivité.

L'objectif est de pouvoir centraliser différentes données sur une carte : bâtiments, voirie, équipements, espaces verts, communes, etc., tout en permettant aux utilisateurs de les consulter ou de les modifier selon leurs droits.

Le projet est actuellement basé sur des données territoriales de Saint-Étienne Métropole.

## Fonctionnalités

*  Carte interactive avec MapLibre GL
*  Affichage de données géographiques sous forme de couches
*  Import de fichiers GeoJSON
*  Création et modification d'objets directement sur la carte
*  Recherche d'objets géographiques
*  Gestion des utilisateurs
*  Authentification avec JWT
*  Gestion des droits selon le rôle de l'utilisateur
*  Stockage des géométries avec PostgreSQL/PostGIS
*  Tableau de bord avec des indicateurs liés aux données
*  Gestion des sources, dates et licences des données importées

### Rôles

| Rôle          | Accès                                             |
| ------------- | ------------------------------------------------- |
| `SUPER_ADMIN` | Gestion complète de l'application                 |
| `ADMIN`       | Utilisateurs, couches et données                  |
| `AGENT`       | Création et modification des objets géographiques |
| `CITIZEN`     | Consultation des données                          |

## Stack technique

### Backend

* Python
* FastAPI
* SQLAlchemy
* GeoAlchemy2
* PostgreSQL
* PostGIS
* Alembic
* JWT

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* MapLibre GL
* Terra Draw

## Architecture

L'application est séparée en deux parties :

```text
┌──────────────────────┐
│      Frontend        │
│ React + TypeScript   │
│ MapLibre GL          │
└──────────┬───────────┘
           │
           │ REST API / JWT
           ▼
┌──────────────────────┐
│       Backend        │
│       FastAPI        │
└──────────┬───────────┘
           │
           │ SQLAlchemy / GeoAlchemy2
           ▼
┌──────────────────────┐
│ PostgreSQL + PostGIS │
└──────────────────────┘
```

Les données géographiques sont organisées autour de deux concepts principaux :

* Layer : représente une couche géographique.
* Feature : représente un objet appartenant à une couche.

Chaque feature possède une géométrie PostGIS ainsi qu'un ensemble de propriétés stockées en JSONB.

Cette organisation permet d'ajouter de nouvelles catégories de données sans devoir créer une nouvelle table pour chaque type d'équipement.

## Installation

### Prérequis

* Python 3.11+
* Node.js 20+
* PostgreSQL 14+
* PostGIS 3+
* Docker (optionnel)

### 1. Cloner le projet

```bash
git clone <URL_DU_REPO>
cd websig-patrimoine
```

### 2. Backend

```bash
cd backend

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt
pip install -r requirements-dev.txt
```

.env
```

Configurer notamment la connexion PostgreSQL et les variables liées à l'authentification.

Puis appliquer les migrations :

```bash
alembic upgrade head
```

Créer le premier compte administrateur :

```bash
python -m app.seed
```

Pour importer les données géographiques fournies avec le projet :

```bash
python -m app.import_geodata
```

Lancer l'API :

```bash
uvicorn app.main:app --reload
```

L'API est alors disponible sur :

```text
http://localhost:8000
```

La documentation Swagger est disponible sur :

```text
http://localhost:8000/docs
```

### 3. Frontend

Dans un autre terminal :

```bash
cd frontend

npm install
npm run dev
```

Le frontend est disponible sur :

```text
http://localhost:5173
```

L'URL de l'API peut être configurée dans `frontend/.env` avec :

```env
VITE_API_URL=http://localhost:8000
```

## Données géographiques

Le projet utilise actuellement des données concernant Saint-Étienne Métropole.

Les données fournies comprennent notamment :

* le territoire de Saint-Étienne Métropole ;
* les communes membres ;
* leurs informations associées ;
* les métadonnées des sources utilisées.

Les données importées conservent leur source, leur date et leur licence lorsque ces informations sont disponibles.

De nouvelles données peuvent également être ajoutées directement depuis l'interface d'administration au format GeoJSON.

## Import GeoJSON

L'interface permet d'importer un fichier GeoJSON sans avoir à modifier directement la base de données.

Le processus est le suivant :

1. sélectionner un fichier `.geojson` ;
2. vérifier les objets et leur type de géométrie ;
3. renseigner les informations de la couche ;
4. importer les données ;
5. retrouver la nouvelle couche directement sur la carte.

Les géométries compatibles avec une couche sont vérifiées lors de l'import.

## API

Quelques routes principales :

| Méthode  | Route                              | Description          |
| -------- | ---------------------------------- | -------------------- |
| `POST`   | `/api/auth/register`               | Créer un compte      |
| `POST`   | `/api/auth/login`                  | Se connecter         |
| `GET`    | `/api/auth/me`                     | Utilisateur connecté |
| `GET`    | `/api/layers`                      | Liste des couches    |
| `POST`   | `/api/layers`                      | Créer une couche     |
| `GET`    | `/api/layers/{id}/features`        | Objets d'une couche  |
| `POST`   | `/api/layers/{id}/features`        | Ajouter un objet     |
| `POST`   | `/api/layers/{id}/features/import` | Import GeoJSON       |
| `PUT`    | `/api/features/{id}`               | Modifier un objet    |
| `DELETE` | `/api/features/{id}`               | Supprimer un objet   |

La documentation complète est accessible avec Swagger sur `/docs`.

## Tests

Les tests backend utilisent `pytest` et une base PostgreSQL dédiée.

```bash
cd backend

pytest
```

Pour obtenir plus de détails :

```bash
pytest -v
```

## Docker

Une configuration Docker est également disponible.

```bash
.env

docker compose up --build -d
```

Puis :

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed
docker compose exec backend python -m app.import_geodata
```

## Structure du projet

```text
websig-patrimoine/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   ├── alembic/
│   ├── data/
│   └── tests/
│
├── frontend/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── context/
│       ├── lib/
│       ├── pages/
│       └── types/
│
├── docker-compose.yml
└── .env.example
```

## Évolutions prévues

Le projet est encore en développement. Plusieurs évolutions sont envisagées.

### Utilisation sur le terrain

L'application pourrait être utilisée directement depuis un téléphone ou une tablette afin qu'un agent puisse ajouter ou modifier une donnée depuis le terrain.

L'idée serait notamment de pouvoir :

* récupérer automatiquement la position GPS ;
* créer un objet à l'emplacement actuel ;
* ajouter des informations ou des photos ;
* modifier l'état d'un équipement ;
* travailler depuis une interface adaptée aux écrans mobiles.

Par exemple, un agent pourrait signaler directement depuis le terrain un équipement endommagé, avec sa position et les informations nécessaires.

### Statistiques par commune

Une autre évolution importante concerne l'exploitation des données présentes dans les différentes couches.

L'objectif serait de générer automatiquement des indicateurs par commune, par exemple :

* nombre d'équipements ;
* nombre d'équipements par habitant ;
* densité d'équipements ;
* répartition par type ;
* comparaison entre communes ;
* évolution des données dans le temps.

Ces indicateurs pourraient ensuite être affichés dans le tableau de bord sous forme de graphiques et de statistiques.

### Autres pistes

* Historique des modifications des objets
* Import/export Shapefile et GeoPackage
* Requêtes spatiales plus avancées
* Support WMS/WFS
* Intégration avec des outils SIG comme QGIS
* Notifications pour les signalements
* Amélioration de l'utilisation mobile
* Tests frontend

## Sécurité

Avant un déploiement en production :

* ne pas commiter les fichiers `.env` ;
* utiliser des secrets différents de ceux utilisés en développement ;
* générer une nouvelle `SECRET_KEY` ;
* configurer correctement le CORS ;
* ne pas exposer PostgreSQL directement sur Internet ;
* utiliser HTTPS ;
* mettre en place une limitation des tentatives de connexion ;
* vérifier les permissions des différents rôles.

## Statut du projet

Projet en cours de développement.

L'application fonctionne actuellement autour de la gestion de données géographiques, de leur visualisation sur une carte et de leur administration.

Les prochaines étapes portent principalement sur l'utilisation terrain et sur l'exploitation statistique des données.
