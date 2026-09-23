"""
Contrat commun à tous les connecteurs de sources cloud.

Chaque nouvelle source (un nouveau WFS de l'IGN, un nouveau catalogue STAC...)
n'implique QUE d'écrire une classe qui hérite de CloudConnector — le router
et le frontend n'ont rien à savoir de la logique interne de la source.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from sqlalchemy.orm import Session

from app.cloud_sources.schemas import (
    CloudSourceOut,
    DatasetResult,
    ImportResponse,
    SearchParams,
)


class CloudConnector(ABC):
    """Interface que doit implémenter chaque source de données cloud."""

    #: renseigné par les sous-classes, doit correspondre à l'id déclaré dans registry.py
    source: CloudSourceOut

    @abstractmethod
    async def search(self, params: SearchParams) -> list[DatasetResult]:
        """Recherche des jeux de données disponibles sur l'emprise/critères donnés."""
        raise NotImplementedError

    @abstractmethod
    async def import_to_layer(
        self, dataset_id: str, layer_name: str, db: Session, created_by_id: int | None,
        bbox: tuple[float, float, float, float] | None = None,
    ) -> ImportResponse:
        """Récupère les entités du jeu de données et les enregistre en tant que nouvelle Layer + Features."""
        raise NotImplementedError
