# Suivi Global — Point Commande Journalière

Application de suivi de production pour atelier textile haut de gamme.
Elle réunit le **Point Commande Journalière** (les cartes de la réunion), le
**Suivi Global** (chaînes, inspections, expéditions), les **Tableaux des OFs**
(ordres de fabrication par client et par modèle), l'**Historique des
modifications** et le tableau **Développement** (kanban des tâches internes).

---

## 1. Démarrage rapide

1. **Lancer l'application** (voir la section développeur pour l'installation).
   Le serveur affiche l'URL à ouvrir, par défaut `http://localhost:3000`.
2. **Ouvrir cette URL** dans un navigateur.
3. **Choisir un profil** sur l'écran d'accueil (voir ci-dessous).
4. Travailler dans l'onglet souhaité à l'aide des boutons en haut de l'écran.

Plusieurs personnes peuvent ouvrir l'application en même temps : chacune choisit
son propre profil, et **toutes les données sont partagées** entre les postes
(elles sont enregistrées côté serveur). Il suffit que les postes soient sur le
même réseau que le serveur.

---

## 2. Accès et profils

L'écran d'accueil affiche quatre profils. Trois sont protégés par un mot de
passe commun : **`1234`**. Le profil *Utilisateur* entre sans mot de passe.

| Profil | Mot de passe | Ce qu'il peut faire |
| --- | --- | --- |
| **Utilisateur** | aucun | Consultation seule : lit toutes les vues métier, mais ne peut rien modifier. |
| **Resp Planning** | `1234` | Modifie tout, sur toutes les vues métier **+ l'onglet Développement**. |
| **Production** | `1234` | Uniquement l'onglet **Tableaux des OFs** (modifie les quantités d'OF, pas le type). |
| **Direction** | `1234` | Toutes les vues **+ l'onglet Développement + l'onglet Historique**. |

> Le mot de passe est **commun** aux trois profils protégés et vaut `1234`.

### Se déconnecter

Un badge visible en haut de chaque vue affiche votre profil et possède un bouton
**« Se déconnecter »** (icône de sortie). Le clic vous ramène à l'écran
d'accueil ; la session est propre à l'onglet du navigateur.

### Session

La session est mémorisée pour l'onglet du navigateur : un **rafraîchissement de
page (F5) ne vous déconnecte pas**. La dernière vue ouverte est aussi
mémorisée ; à la reconnexion, le profil arrive directement sur son premier
onglet autorisé.

---

## 3. Fonctionnalités en bref

Les onglets en haut de l'écran permettent de passer d'une vue à l'autre (selon
votre profil). Un profil qui n'a qu'un seul onglet autorisé (Production) voit
directement cet onglet, sans sélecteur.

### Point Commande Journalière
- **Pointer une quantité** : cliquez sur la **Qté finie** d'une ligne, saisissez
  la valeur et validez → l'avancement, le reste à produire et le statut se
  recalculent.
- **Ouvrir une carte** : cliquez sur le nom du modèle ou la saison → fiche
  complète (client, saison, modèle, OFs, jalons), modifiable puis enregistrable.
- **Jalons (Nomenclatures & Statuts)** : cliquez sur une pastille pour choisir
  l'état (*En attente*, *Semaine*, *Date*, *TBC*, *Validé*). La couleur indique
  l'échéance (vert à l'heure, orange en marge, rouge en retard).
- **OK Prod / Statut** : modifiables directement dans la ligne.
- **Recherche** : barre de filtres pour retrouver un client, une saison ou un
  modèle.
- **Copier la saison** : bouton de copie à côté de la valeur.

### Suivi Global
- Consultez les **chaînes** de production et leurs **cases** (modèle en cours,
  prochains lancements, inspections, expéditions).
- **Glissez-déposez** une carte d'une case à une autre.
- Ouvrez les **inspections** pour changer leur état et consulter leur historique.
- Gérez les **expéditions** et les **alertes** depuis les cases concernées.
- Les modifications de l'agencement du tableau sont **partagées** entre les
  postes et restaurées au rechargement.

### Tableaux des OFs
- Récapitulatif des OFs **regroupé par client et par modèle**.
- Le profil **Production** peut y modifier les **quantités** des OF directement
  dans le tableau (mais pas le type d'OF).

### Développement *(Resp Planning / Direction)*
- Tableau **kanban** de type Trello pour les tâches internes, indépendant des
  cartes de production.
- **Colonnes** : ajouter, renommer, supprimer, réordonner par glisser-déposer.
  Une colonne peut être **scindée** en deux sections.
- **Tâches (cartes)** : créer, modifier sur place, supprimer, déplacer entre
  colonnes/sections par glisser-déposer ; chacune a un titre, un état, un
  traiteur, un client, des remarques, une couleur et éventuellement une date.
- **Section « BRODERIE MAIN »** : tableau dédié par personne (deux blocs :
  *client* / *initiatives*). On affecte une tâche à une personne par
  glisser-déposer.
- **Alertes de délai** : une date d'échéance devient rouge et clignotante quand
  une tâche reste trop longtemps dans une zone (2 jours ; 4 jours en BRODERIE
  MAIN) ou plus de 12 jours au total sans atteindre la dernière colonne.
- Les tâches sont enregistrées dans le **navigateur** (voir « Astuces »).

### Historique des modifications *(Direction)*
- Liste du plus récent au plus ancien de **toutes les écritures** (Planning et
  Production) : date/heure, profil auteur, action, objet, et détail **champ par
  champ** (avant → après).
- **Filtres** par profil et/ou par jour ; mise à jour automatique.

---

## 4. Astuces

- **Couleurs** : chaque type de carte, statut de jalon et type d'OF a sa propre
  couleur, rappelée dans les en-têtes et les infobulles.
- **Où sont stockées les données** : les cartes, les OFs, le Suivi Global et
  l'historique sont dans la **base partagée du serveur**. En revanche, le tableau
  **Développement** est enregistré dans le **navigateur** de chaque poste : il
  n'est donc pas partagé entre les utilisateurs.
- **Retour au début** : les vues longues se font défiler ; utilisez la molette ou
  les barres de défilement (le Suivi Global et le Développement défilent
  horizontalement).

---

## 5. En cas de problème

- **« Aucune donnée »** : vérifiez que le serveur est démarré (voir la
  documentation développeur) et rechargez la page.
- **Mauvais profil / session bloquée** : cliquez sur **Se déconnecter** dans
  l'en-tête, puis reconnectez-vous avec le bon profil.
- **Le tableau semble vide après une recherche** : videz le champ de recherche.
- **Un tableau de bord ne s'affiche pas** : un écran « Affichage interrompu »
  apparaît alors ; cliquez sur **Réessayer**, ou sur **Réinitialiser les
  données** si le problème persiste, puis rechargez la page.
- **Les données modifiées n'apparaissent pas sur un autre poste** : elles sont
  partagées via le serveur ; vérifiez que les deux postes sont bien connectés au
  même serveur.

---

## 6. Documentation complémentaire

- `docs/DEV.md` — documentation technique (architecture, fichiers, API, base de
  données) destinée aux développeurs.
