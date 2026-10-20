# Suivi Global — Point Commande Journalière

Application de suivi de production pour atelier textile haut de gamme.
Elle réunit le **Point Commande Journalière** (les cartes de la réunion), le
**Suivi Global** (chaînes, inspections, expéditions) et les **Tableaux des OFs**
(ordres de fabrication par client et par modèle).

---

## À quoi ça sert

- **Point Commande Journalière** : vue des cartes de commande du jour — client,
  saison (batch), modèle, nomenclatures/statuts (jalons), quantités demandées et
  finies, avancement, statut, OK Prod.
- **Suivi Global** : tableau des chaînes de production, avec cases (modèle en
  cours, prochains lancements, inspections, expéditions) et alertes.
- **Tableaux des OFs** : récapitulatif des ordres de fabrication regroupés par
  client et par modèle.
- **Historique des modifications** : journal des écritures, réservé à la Direction.

---

## Accès et profils

Sur l'écran d'accueil, choisissez votre profil :

| Profil          | Mot de passe | Ce qu'il peut faire                                                        |
| --------------- | ------------ | -------------------------------------------------------------------------- |
| **Utilisateur** | aucun        | Consultation seule (lecture seule partout, aucune modification possible).  |
| **Resp Planning** | `1234`     | Toutes les modifications, sur toutes les vues.                              |
| **Production**  | `1234`       | Uniquement l'onglet **Tableaux des OFs** ; modifie les quantités d'OF.     |
| **Direction**   | `1234`       | Toutes les vues **+ l'onglet Historique des modifications**.               |

> Le mot de passe est commun aux trois profils protégés et vaut `1234`.

La session est mémorisée pour l'onglet du navigateur : un rafraîchissement de
page (F5) ne vous déconnecte pas. Utilisez le bouton de déconnexion dans
l'en-tête pour changer de profil.

---

## Fonctionnalités en bref

Les onglets en haut de l'écran font passer d'une vue à l'autre (selon votre
profil). La vue choisie est mémorisée.

### Point Commande
- **Pointer une quantité** : cliquez sur la **Qté finie** d'une ligne, saisissez
  la valeur, validez → avancement, reste à produire et statut se recalculent.
- **Ouvrir une carte** : cliquez sur le nom ou la saison → fiche complète
  (client, saison, modèle, OFs, jalons) modifiable puis enregistrable.
- **Jalons (Nomenclatures & Statuts)** : cliquez sur une pastille pour choisir
  l'état (*En attente*, *Semaine*, *Date*, *TBC*, *Validé*). Couleur = échéance
  (vert à l'heure, orange en marge, rouge en retard).
- **OK Prod / Statut** : modifiables directement dans la ligne.
- **Recherche** : barre de filtres pour retrouver un client, une saison, un
  modèle.
- **Copier la saison** : bouton copie à côté de la valeur.

### Suivi Global
- Consultez les chaînes et leurs cases (modèle en cours, prochains lancements,
  inspections, expéditions).
- **Glissez-déposez** une carte d'une case à l'autre.
- Ouvrez les **inspections** pour changer leur état et voir leur historique.
- **Expéditions** et **alertes** accessibles depuis les cases concernées.

### Tableaux des OFs
- Vue récapitulative des OFs **regroupée par client et par modèle**.
- Le profil Production peut y **modifier les quantités** des OF directement.

### Historique (profil Direction)
- Liste du plus récent au plus ancien toutes les modifications (Planning et
  Production) : date/heure, profil auteur, action, objet, détail des champs.
- **Filtres** par profil et/ou par jour ; mise à jour automatique.

---

## Astuces

- **Couleurs** : chaque type de carte, statut de jalon et type d'OF a sa propre
  couleur, rappelée dans les en-têtes et les infobulles.

---

## En cas de problème

- **« Aucune donnée »** : vérifiez que le serveur est démarré (voir la section
  développeur) et rechargez la page.
- **J'ai perdu ma connexion / mauvais profil** : cliquez sur la déconnexion dans
  l'en-tête, puis reconnectez-vous.
- **Le tableau semble vide après une recherche** : videz le champ de recherche.
