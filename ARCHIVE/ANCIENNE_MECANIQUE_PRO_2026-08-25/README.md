# 🏠 DIGIY LOC PRO — Chez Baptiste

Planning professionnel & gestion des réservations  
0% commission • Paiement direct • Données souveraines

---

## 🎯 Objectif

**DIGIY LOC PRO** est le module professionnel de gestion des hébergements du système **DIGIYLYFE**.

Ce module permet à un **propriétaire / gestionnaire** de :
- visualiser son **planning 14 jours**
- enregistrer des **réservations manuelles**
- distinguer les sources (DIGIY / Booking / OTA)
- garder le **contrôle total**, sans commission ni intermédiaire

👉 Cette page est **réservée aux PRO**, accessible depuis **Mon Espace DIGIY (HUB)**.

---

## 🔐 Accès & sécurité

- Authentification gérée par **Supabase Auth**
- Accès prévu uniquement via :
  - `Mon Espace DIGIY → Module LOC`
- Aucune logique publique (pas d’annonce, pas de paiement ici)

📌 **Important**  
Ce module n’est **pas une page publique**.  
Il ne remplace pas une annonce Airbnb / Booking.  
C’est un **outil de travail PRO**.

---

## 🧩 Fonctionnalités actuelles (V1)

### 📅 Planning
- Vue **14 jours glissants**
- Statuts visuels :
  - 🟢 Libre (DIGIY)
  - 🟡 Réservé DIGIY
  - 🔴 Occupé Booking / OTA
  - ⚫ Fermé

### 📝 Réservations
- Ajout manuel d’une réservation
- Champs :
  - Nom client
  - Téléphone / WhatsApp
  - Dates (check-in / check-out)
  - Source (DIGIY / Booking / Autre)
  - Notes internes

### 📋 Liste
- Liste des réservations à venir
- Lecture claire, orientée terrain

---

## 🗄️ Base de données (Supabase)

Table utilisée :

### `loc_reservations`
Champs principaux :
- `business_code` (ex: `chez-baptiste`)
- `room_code`
- `room_label`
- `guest_name`
- `phone`
- `source` (`digiy`, `booking`, `ota`, `autre`)
- `check_in`
- `check_out`
- `status`
- `comment`

📌 Le filtre principal se fait par :
```sql
business_code = 'chez-baptiste'
