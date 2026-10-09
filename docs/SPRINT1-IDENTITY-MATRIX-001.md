# Sprint 1 — synthetische identiteitsmatrix

Status: lokale contracttest op de Node/SQLite-snapshot `f53a21b5b00a024e083de7ef26c98a865ebb53af`. Geen Sites-, DEV-, ACC- of PROD-acceptatie.

## Kaart en reikwijdte

- Bestaande bordkaarten: `cai-sprint-role-matrix` en `cai-sprint-five-accounts` (taakmapping van coördinator; geen bordstatus gewijzigd).
- Uitvoer: `test/identity-persona-matrix.test.mjs`, uitgevoerd tegen een tijdelijk lokaal HTTP-proces en tijdelijke SQLite-database met uitsluitend `example.test`-identiteiten.
- Vijf synthetische sessies: owner=`admin`, backoffice=`planner`, worker=`technician`, partner-simulator=`reader`, customer-simulator=`reader`. De laatste twee zijn **geen** productrollen of veilige klant-/partneraccounts.

## Geobserveerde matrix

| Persona | Huidige rol | Gebruikersbeheer | Monteurslijst | Facturen | CMS-concepten |
| --- | --- | --- | --- | --- | --- |
| Owner | `admin` | 200 | 200 | 200 | 200 |
| Backoffice | `planner` | 403 | 200 | 403 | 401 |
| Worker | `technician` | 403 | 403 | 403 | 401 |
| Partner-simulator | `reader` | 403 | 403 | 403 | 403 |
| Customer-simulator | `reader` | 403 | 403 | 403 | 403 |

Het lokale API-contract weigert `partner` en `customer` als rol (`INVALID_USER`, HTTP 400). De `reader`-rol kan de interne `/api/operations/customers`-lijst lezen, inclusief synthetisch gemaakte klantrecords. Dit is **geen afscherming** voor externe partners of klanten. Deze simulators mogen niet als productaccount worden uitgerold. Een eigen externe rol-/object-/tenantbeleid en bijbehorende deny-by-default tests zijn een noodzakelijke vervolgstap voordat de vijf-accountkaart op Gereed kan.

## Extra toegangsproeven

- Twee extra editor-sessies: editor B krijgt 404 op het concept van editor A en kan dat concept niet aanpassen; de eigenaar/admin ziet het concept en het origineel blijft gelijk.
- Een geauthenticeerde mutatie zonder CSRF-token krijgt 403; verkeerde Origin krijgt 403. De geldige mutatie geeft 200, herhaling met dezelfde idempotency key dezelfde respons, gewijzigde payload met die sleutel 409.
- Rolwijziging planner→reader trekt de oude sessie in (401). Een nieuwe sessie heeft minder rechten (monteurslijst 403).
- Logout trekt de worker-sessie in (401 op sessie en afgeschermde ERP-read).

## Grenzen voor acceptatie

- Geen tenantmodel/tenant-id in deze lokale auth-/content-/operations-routes aangetroffen: **wrong-tenant test NOT_IMPLEMENTED**, geen fictieve pass.
- Geen Sites-identiteitsadapter of productiesessie aan deze lokale test gekoppeld.
- Geen onafhankelijke security- of ACC-beoordeling van dit increment.
- De test bewijst alleen de huidige lokale autorisatiegrenzen; Product Owner moet de externe partner-/klantcapaciteiten en eigendomsregels vastleggen voordat implementatie en onafhankelijke acceptatie kunnen volgen.

## Skillroutering

`auth0:auth0` en `duende-skills:identity-testing-patterns` op toepasbaarheid gelezen. Deze lokale contracttest raakt geen Auth0-provider- of Duende IdentityServer-flow; daarom `NO_APPLICABLE_SKILL` voor de uitvoering. Auth0-linking bestaat in de bron, maar is niet door deze test bevestigd.
