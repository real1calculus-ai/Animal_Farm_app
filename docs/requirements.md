# Pig Farm Management System - Requirements & Planning Document

## 1. EXECUTIVE OVERVIEW

### System Scope
A comprehensive web/mobile application for managing a large-scale pig farm (200+ animals) with integrated modules for:
- Intelligent breeding management with pedigree tracking
- Health and medical record management
- Feed and nutrition tracking
- Financial management and reporting
- Inventory and asset tracking
- Employee/staff management
- Analytics and reporting dashboard

### Target Users
- Farm owners/managers
- Veterinary staff
- Feed specialists
- Field workers
- Accountants/finance managers

---

## 2. CORE DATA MODELS & ENTITIES

### 2.1 Animal Management

#### Pig Entity
```
PigID (Unique identifier)
├─ Basic Info
│  ├─ Name/Identifier
│  ├─ Breed (Duroc, Large Black, Berkshire, etc.)
│  ├─ Date of Birth
│  ├─ Sex (Male/Female)
│  ├─ Status (Active, Sold, Deceased, Retired)
│  └─ Current Weight
│
├─ Pedigree Info
│  ├─ Mother ID (FK to Pig)
│  ├─ Father ID (FK to Pig)
│  ├─ Generation Level
│  ├─ Genetic Score (optional: inbreeding coefficient)
│  └─ Siblings (auto-calculated)
│
├─ Location & Housing
│  ├─ Current Pen/Enclosure ID
│  ├─ Housing Type (Farrowing, Breeding, Grower, Finisher)
│  └─ Date Moved
│
├─ Physical Traits (for breed selection)
│  ├─ Weight
│  ├─ Body Condition Score
│  ├─ Congenital Defects/Issues
│  └─ Phenotype Notes
│
└─ Lifecycle Events
   ├─ Date Acquired
   ├─ Date Purchased/Bred
   ├─ Date Sold/Culled
   └─ Reason for Exit
```

#### Breeding Record Entity
```
BreedingID
├─ Dam (Mother) ID
├─ Sire (Father) ID
├─ Breeding Date
├─ Expected Farrowing Date
├─ Actual Farrowing Date
├─ Litter Size (Born/Survived)
├─ Notes (Complications, etc.)
└─ Pregnancy Status (Confirmed/Pending/Not Pregnant/Failed)
```

#### Litter/Offspring Entity
```
LitterID
├─ Breeding Record ID (FK)
├─ Number of Piglets
├─ Piglets Details
│  ├─ Individual IDs
│  ├─ Sex
│  ├─ Birth Weight
│  ├─ Status (Alive/Died)
│  └─ Markings/Identification
│
├─ Weaning Date
├─ Mortality Rate
└─ Morbidity Notes
```

### 2.2 Breeding Management

#### Pedigree & Inbreeding Prevention
```
Pedigree Database
├─ Relationship Matrix
│  ├─ Calculate genetic distance between animals
│  ├─ Identify siblings
│  ├─ Identify parent-offspring relationships
│  └─ Calculate inbreeding coefficient
│
└─ Breeding Restriction Rules
   ├─ Prevent: Same sire + dam (full siblings)
   ├─ Prevent: Parent + offspring
   ├─ Prevent: Half-siblings (optional threshold)
   ├─ Alert: Distant cousin matings (optional)
   └─ Track: Generations to maintain genetic diversity
```

#### Breeding Recommendations Engine
```
Match Finding Algorithm
├─ Input: Selected Dam (Female)
├─ Output: List of compatible Sires (ranked)
│
├─ Matching Criteria
│  ├─ Age & Health Status (both must be breeding-ready)
│  ├─ Pedigree Compatibility (no genetic conflicts)
│  ├─ Genetic Diversity Score (maximize)
│  ├─ Breed Standards Match
│  ├─ Phenotype Complementarity
│  └─ Current Breeding Load (avoid over-breeding)
│
└─ Ranking System
   ├─ Genetic score (40%)
   ├─ Diversity potential (30%)
   ├─ Phenotype match (20%)
   └─ Health history (10%)
```

### 2.3 Health Management

#### Health Record Entity
```
HealthRecordID
├─ Pig ID
├─ Date Recorded
├─ Record Type (Illness/Injury/Vaccination/Treatment/Exam)
├─ Category
│  ├─ Reproductive (Fertility issues, miscarriage, etc.)
│  ├─ Respiratory (Pneumonia, cough, etc.)
│  ├─ Digestive (Diarrhea, constipation, etc.)
│  ├─ Musculoskeletal (Lameness, fracture, etc.)
│  ├─ Skin/External (Mange, wounds, etc.)
│  ├─ Parasitic (Worms, lice, etc.)
│  ├─ Metabolic (Anemia, dehydration, etc.)
│  └─ Behavioral (Aggression, lethargy, etc.)
│
├─ Severity Level (Mild/Moderate/Severe)
├─ Diagnosis
├─ Treatment Applied
├─ Medications
│  ├─ Drug Name
│  ├─ Dosage
│  ├─ Route (Oral/Injection/Feed)
│  ├─ Duration
│  ├─ Withdrawal Period (days)
│  └─ Date Completed
│
├─ Veterinary Notes
├─ Cost of Treatment
└─ Outcome (Recovered/Ongoing/Death)
```

#### Vaccination Schedule
```
VaccinationSchedule
├─ Piglet Vaccinations
│  ├─ Age 0-3 days: Colostrum protection
│  ├─ Age 2-3 weeks: PRRS, Mycoplasma, etc.
│  ├─ Age 4-6 weeks: Booster shots
│  └─ Weaning: Enterotoxemia, etc.
│
├─ Growing/Finishing Pigs
│  ├─ Age 8-10 weeks: Additional boosters
│  └─ Pre-slaughter requirements
│
└─ Breeding Animals
   ├─ Reproductive disease vaccines
   ├─ Annual boosters
   └─ Pre-breeding checks

VaccinationRecord
├─ Pig ID
├─ Vaccine Type
├─ Date Administered
├─ Lot Number
├─ Veterinarian
├─ Next Due Date
└─ Notes
```

#### Disease Tracking & Alerts
```
Disease Registry
├─ Active Diseases on Farm (with prevalence)
├─ Exposure Events
├─ Contagion Paths
└─ Alert System for:
   ├─ Sudden mortality increase
   ├─ Reproductive failure cluster
   ├─ Weight gain decline
   └─ Disease re-emergence
```

### 2.4 Feed & Nutrition Management

#### Feed Inventory
```
FeedInventory
├─ Feed Type
│  ├─ Name/Description
│  ├─ Classification (Starter/Grower/Finisher/Breeding/etc.)
│  ├─ Nutritional Profile
│  │  ├─ Protein %
│  │  ├─ Fat %
│  │  ├─ Fiber %
│  │  ├─ Minerals (Ca, P, etc.)
│  │  ├─ Vitamins
│  │  └─ Metabolizable Energy (kcal/kg)
│  │
│  ├─ Cost per Unit
│  ├─ Supplier
│  └─ Storage Requirements
│
├─ Current Stock Levels
│  ├─ Quantity in Storage
│  ├─ Units (kg, bags, etc.)
│  ├─ Last Received Date
│  ├─ Expiration Date
│  └─ Reorder Level
│
└─ Batch Tracking
   ├─ Batch ID
   ├─ Supplier Lot Number
   ├─ Date Received
   ├─ Nutritional Analysis (if available)
   └─ Quality Notes
```

#### Feeding Programs by Stage
```
Feeding Plan
├─ Piglets (0-4 weeks): Colostrum → Starter feed
├─ Weaners (4-10 weeks): Specialized weaner diet
├─ Growers (10-20 weeks): Growth-optimized feed
├─ Finishers (20+ weeks): Finishing diet
├─ Breeding Gilts: Maintenance + growth
├─ Breeding Sows: Maintenance + reproductive support
└─ Boars: Maintenance + fertility support

Feeding Record
├─ Pig/Group ID
├─ Feed Type
├─ Quantity Allocated (kg/day or per feeding)
├─ Actual Consumption
├─ Date
├─ Notes (Feed refusal, spillage, etc.)
└─ Feeder/Observer Name
```

#### Nutrition Tracking
```
Nutrition Monitoring
├─ Growth Tracking
│  ├─ Average Daily Gain (ADG) by stage
│  ├─ Feed Conversion Ratio (FCR)
│  ├─ Weight progression
│  └─ Body Condition Score trends
│
├─ Individual Pig Performance
│  ├─ Expected vs. Actual weight
│  ├─ Feed intake variances
│  └─ Health correlation to nutrition
│
└─ Alerts
   ├─ Slow growth identified
   ├─ Poor feed consumption
   ├─ Suspected malnutrition issues
   └─ Feed quality concerns
```

### 2.5 Reproductive Management

#### Estrus Cycle Tracking
```
EstrusCycleRecord
├─ Sow ID
├─ Cycle Start Date
├─ Behavioral Signs
│  ├─ Restlessness
│  ├─ Swollen Vulva
│  ├─ Discharge
│  └─ Receptiveness
│
├─ Estrus Duration
├─ Breeding Status (Not Yet Bred / Bred / Re-bred)
├─ Days Since Last Breed (for cycling sows)
└─ Notes
```

#### Pregnancy & Farrowing
```
PregnancyRecord
├─ Sow ID
├─ Boar ID
├─ Breeding Date
├─ Pregnancy Confirmation
│  ├─ Confirmation Method (Ultrasound/Behavioral/etc.)
│  ├─ Confirmation Date
│  ├─ Expected Number of Piglets
│  └─ Abnormalities Noted
│
├─ Farrowing Preparations
│  ├─ Pre-farrowing Health Check
│  ├─ Farrowing Pen Assignment
│  ├─ Feeding Adjustments
│  └─ Monitoring Frequency
│
└─ Farrowing Event
   ├─ Farrowing Date
   ├─ Farrowing Duration
   ├─ Number Born Alive
   ├─ Stillborns
   ├─ Mummified
   ├─ Complications (Dystocia, retained placenta, etc.)
   ├─ Piglet Viability Assessment
   ├─ Colostrum Intake (observed)
   ├─ Post-Farrowing Health Check
   └─ Veterinary Intervention Required
```

#### Sow Productivity Metrics
```
SowPerformance
├─ Lifetime Pigs Born (LPB)
├─ Lifetime Pigs Weaned (LPW)
├─ Pigs Born per Litter
├─ Pigs Weaned per Litter
├─ Farrowing Interval (days between farrowings)
├─ Culling Reason (if applicable)
├─ Longevity (parities completed)
└─ Breeding Retirement Plan
```

---

## 3. FEATURE SPECIFICATIONS

### 3.1 Breeding Management Module

#### Feature: Pedigree Visualization
- **What it does**: Display animal family tree, multi-generation view
- **Prevents**: User selects incompatible breeding pairs
- **Output**: Visual pedigree tree with color-coded warnings (inbreeding risk)
- **Data required**: Complete ancestry records for all animals

#### Feature: Breeding Match Finder
- **Input**: Select a female pig
- **Process**:
  1. Retrieve female's pedigree and genetics
  2. Calculate compatibility with all eligible males
  3. Flag siblings, parents, offspring as incompatible
  4. Score remaining males by:
     - Genetic distance (maximize)
     - Phenotype complementarity
     - Age/health compatibility
     - Breeding load (avoid over-using sires)
  5. Rank and display recommendations
- **Output**: Ranked list of recommended sires with explanation
- **Example**: "Sire #42 (80/100) - Excellent genetic diversity, complements dam's bone structure, never used yet"

#### Feature: Breeding Calendar
- **What it tracks**:
  - Breeding dates
  - Expected farrowing dates (21-day cycle)
  - Actual farrowing events
  - Sow cycling status
  - Next breeding opportunity windows
- **Alerts**:
  - Overdue farrowings (21+ days)
  - Sows not cycling after expected interval
  - High-risk farrowings requiring monitoring
  - Gilt maturity readiness (first breeding age/weight)

#### Feature: Genetic Diversity Monitoring
- **Metrics tracked**:
  - Inbreeding coefficient (F) for each animal
  - Effective population size
  - Generation tracking
  - Lineage balance (no single ancestor over-represented)
- **Alerts**:
  - Inbreeding above threshold (e.g., F > 10%)
  - Genetic diversity decline trend
  - Recommendation to introduce new genetics

### 3.2 Health Management Module

#### Feature: Health Record Database
- **Quick entry**: Condition type → Auto-populate common symptoms/treatments
- **Smart alerts**:
  - Medications with withdrawal periods
  - Vaccine schedules by age/stage
  - Disease outbreaks (if 3+ animals with same condition in 7 days)
  - Sick animal isolation recommendations
- **Search**: Filter by condition, date range, severity, pig ID

#### Feature: Vaccination Management
- **System maintains**:
  - Standard vaccination schedule (by breed/farm protocol)
  - Upcoming vaccines (dashboard alert)
  - Vaccination history
  - Lot number tracking (for recall purposes)
- **Compliance**: Track which animals are up-to-date
- **Reports**: Vaccination coverage % by pen/age group

#### Feature: Disease Monitoring & Alerts
- **Dashboards**:
  - Current morbidity rate (% sick) by pen
  - Mortality events (flagged if sudden increase)
  - Disease timeline (prevalence of each condition)
- **Analytics**:
  - Seasonal disease patterns
  - Disease correlation to housing/feed/procedures
  - Antibiotic usage tracking (important for resistance monitoring)
- **Biosecurity**:
  - Isolation protocols when disease detected
  - Cross-pen exposure risk assessment
  - Cleaning/disinfection scheduling

#### Feature: Reproductive Health Tracking
- **Specific to breeding stock**:
  - Sow estrus cycles and regularity
  - Conception rates by sire/dam
  - Litter quality trends
  - Stillbirth/mummification rates
  - Farrowing complications log
- **Alerts**:
  - Sows not cycling (potential fertility issue)
  - Boar fertility concerns (low conception rates)
  - Dystopia risk factors in pregnant sows
  - Potential genetic defects in offspring clusters

### 3.3 Feed & Nutrition Module

#### Feature: Feed Inventory Management
- **Tracking**:
  - Stock levels by feed type
  - Automatic reorder alerts (when stock < minimum)
  - Expiration date monitoring
  - Cost tracking ($/kg, total value in storage)
- **Lot management**:
  - Track which animals ate which batch
  - Recall capability if feed contamination discovered
  - Nutritional analysis if available

#### Feature: Feeding Plan by Growth Stage
- **Pre-set feeding programs**:
  - Piglet starter (0-4 weeks)
  - Weaner diet (4-10 weeks)
  - Grower ration (10-20 weeks)
  - Finisher ration (20+ weeks to market)
  - Breeding sow ration
  - Boar maintenance ration
- **Customization**: Adjust quantities based on:
  - Individual pig weight
  - Group average weight
  - Target growth rate
  - Body condition score

#### Feature: Feed Consumption Logging
- **Daily entry**: Quantity provided vs. consumed
- **Analysis**:
  - Track Feed Conversion Ratio (kg feed / kg weight gain)
  - Identify low feeders (health concern?)
  - Group consumption trends
  - Spillage/waste estimation
- **Alerts**:
  - Sudden consumption drop (illness signal)
  - Individual pigs not eating (isolation needed)
  - Feed refusal by group (quality issue?)

#### Feature: Nutritional Performance Tracking
- **Individual metrics**:
  - Weight progression vs. expected growth curve
  - Average Daily Gain (ADG)
  - Body Condition Score trends
  - Visible nutritional deficiencies
- **Alerts**:
  - Slow growers (investigate feed, genetics, health)
  - Over-conditioned animals (adjust feed)
  - Signs of malnutrition
- **Reports**:
  - Performance by diet type
  - Performance by pen/housing
  - Performance by bloodline (genetics)

### 3.4 Financial Management Module

#### Feature: Cost Tracking
```
Cost Categories
├─ Feed Costs
│  ├─ By feed type
│  ├─ By growth stage
│  ├─ By pig (allocated)
│  └─ Cost per kg gain (FCR analysis)
│
├─ Veterinary & Health
│  ├─ Vaccination programs
│  ├─ Illness treatments
│  ├─ Reproductive health
│  └─ Preventive care
│
├─ Labor
│  ├─ Daily farm operations
│  ├─ Breeding management
│  ├─ Health monitoring
│  └─ Feed preparation/distribution
│
├─ Housing & Infrastructure
│  ├─ Maintenance
│  ├─ Utilities (water, heating)
│  ├─ Bedding/litter
│  └─ Equipment
│
├─ Breeding Costs
│  ├─ Genetic testing (if applicable)
│  ├─ Breeding animal acquisition
│  └─ Artificial insemination (if used)
│
└─ Transportation & Marketing
   ├─ Feed delivery
   ├─ Slaughter transport
   └─ Marketing materials
```

#### Feature: Revenue Tracking
```
Revenue Sources
├─ Piglet Sales
│  ├─ Feeder pigs (sold at ~25 kg)
│  ├─ Breeding stock sales
│  └─ Volume & price tracking
│
├─ Finished Pig Sales
│  ├─ Weight at sale
│  ├─ Price per kg
│  ├─ Buyer information
│  └─ Carcass quality assessment (if available)
│
├─ Culled Animal Sales
│  ├─ Breeding stock culling
│  ├─ Value recovered
│  └─ Reason for culling
│
└─ Genetic/Breeding Services (if applicable)
   ├─ Semen sales
   ├─ Piglet breeding stock sales
   └─ Consulting services
```

#### Feature: Profitability Analysis
- **Pig-level profitability**:
  - Cost per pig from birth to sale
  - Revenue generated per pig
  - Profit margin per sale
- **Group/batch profitability**:
  - Pen/batch production cost
  - Batch sale revenue
  - Batch profit margin
- **Performance comparisons**:
  - Profitability by breeding line
  - Profitability by feed type
  - Profitability by season
- **Benchmarking**:
  - Cost per kg of gain
  - Break-even weight/age
  - ROI on breeding investments

#### Feature: Financial Reporting
- **Reports**:
  - Monthly P&L
  - Quarterly cost analysis
  - Annual farm profitability
  - Budget vs. actual comparisons
- **Forecasting**:
  - Projected revenue (from piglets in pipeline)
  - Projected costs (feed, veterinary)
  - Cash flow projections
  - Break-even analysis

### 3.5 Inventory & Asset Management

#### Feature: Equipment Tracking
- **Inventory**:
  - Feeders and waterers
  - Breeding equipment
  - Veterinary equipment
  - Building materials
- **Maintenance schedules**:
  - Preventive maintenance
  - Repair logs
  - Replacement alerts (age-based)
- **Cost tracking**: Depreciation, maintenance costs

#### Feature: Housing/Pen Management
- **Capacity tracking**:
  - Pen descriptions and capacity
  - Current occupancy
  - Occupancy history
- **Maintenance**:
  - Cleaning schedules
  - Repairs needed
  - Cleaning records (for biosecurity)
- **Assignment logic**:
  - Age/stage appropriate housing
  - Compatibility (avoid aggressive animals together)
  - Disease isolation pens

#### Feature: Feed Storage Management
- **Storage locations**:
  - Feed bins and storage areas
  - Capacity of each
  - Current fill levels
- **Organization**:
  - First-in-first-out (FIFO) tracking
  - Lot number organization
  - Quality control (pest detection, moisture, etc.)

---

## 4. BREEDING LOGIC IN DETAIL

### 4.1 Pedigree Database Structure

The system must track complete ancestry to prevent inbreeding. At minimum, 4 generations back.

```
Relationship Calculations:
├─ Sibling Detection
│  └─ If (Dam1 == Dam2 AND Sire1 == Sire2) → FULL SIBLINGS (REJECT)
│
├─ Half-Sibling Detection
│  └─ If (Dam1 == Dam2 XOR Sire1 == Sire2) → HALF SIBLINGS (CAUTION)
│
├─ Parent-Offspring Detection
│  ├─ If (NewSire is in offspring's ancestors) → REJECT
│  ├─ If (NewDam is in offspring's ancestors) → REJECT
│  └─ If (NewSire or NewDam is already offspring) → REJECT
│
├─ Inbreeding Coefficient (F)
│  └─ Calculated using pedigree path analysis
│     - Multiple paths through common ancestors
│     - Higher F = higher genetic similarity = higher inbreeding
│     - Threshold alert (e.g., F > 10%)
│
└─ Genetic Distance Score
   └─ Measures how different two animals are genetically
      - Goal: Maximize to avoid inbreeding
      - Uses pedigree depth and branch diversity
```

### 4.2 Breeding Recommendation Algorithm

```
ALGORITHM: Find Best Sires for Selected Dam

INPUT: DamID, CurrentAnimals, AllowedInbreedingLevel (e.g., 0.10)

OUTPUT: RankedList[SireID, CompatibilityScore]

STEPS:
1. Retrieve Dam's pedigree (4+ generations)
2. Get all eligible Sires (age-appropriate, health status good)
3. For each Sire:
   a) Check Hard Constraints:
      - Is Sire a sibling of Dam? → REJECT
      - Is Sire an ancestor of Dam? → REJECT
      - Is Dam an ancestor of Sire? → REJECT
      - Calculate F (inbreeding coeff) → If F > threshold → FLAG/REJECT
   
   b) Calculate Soft Scores (0-100):
      - GeneticDistance = (1 - F) * 100  [40% weight]
      - DiversityScore = CountUniquePaths / MaxPaths * 100  [30% weight]
      - PhenotypeMatch = ComparePhenotypes(Sire, Dam) * 100  [20% weight]
      - HealthScore = SireHealthHistoryScore  [10% weight]
   
   c) Final Score = (GeneticDistance * 0.4) + (DiversityScore * 0.3) 
                    + (PhenotypeMatch * 0.2) + (HealthScore * 0.1)

4. Sort by Final Score (descending)
5. Return top 10-20 recommendations with explanations

EXAMPLE OUTPUT:
├─ Boar #42: Score 87/100 ✅
│  ├─ Reason: Excellent genetic diversity (F=0.02), strong health history
│  ├─ Inbreeding Risk: Low
│  └─ Expected Offspring Vigor: High
│
├─ Boar #18: Score 76/100 ⚠️
│  ├─ Reason: Good genetics, but previously used 3x
│  ├─ Inbreeding Risk: Low-Moderate
│  └─ Expected Offspring Vigor: Good
│
└─ Boar #55: Score 62/100 ❌
   ├─ Reason: Moderate inbreeding risk (F=0.08)
   ├─ Inbreeding Risk: Moderate
   └─ Note: Acceptable if diversity is critical priority
```

### 4.3 Breeding Constraints & Rules

```
HARD CONSTRAINTS (Auto-Reject):
✗ Same Sire + Dam (full siblings)
✗ Parent-Offspring matings
✗ Sire already related as full sibling or closer

SOFT CONSTRAINTS (Warn/Caution):
⚠ Half-sibling (can be bred if diversity is critically needed)
⚠ Distant cousins (if F > 5-10% threshold)
⚠ Repeated use of same Sire (genetic bottleneck risk)

USER-CONFIGURABLE THRESHOLDS:
• Maximum acceptable inbreeding coefficient (F_max)
• Maximum uses per Sire in calendar year
• Minimum generation gap between breeding
• Mandatory genetic testing requirements
```

---

## 5. REPORTING & ANALYTICS

### 5.1 Dashboard Overview
- **Key Metrics at a glance**:
  - Current animal count by category
  - Animals due for breeding/farrowing
  - Sick animals requiring attention
  - Feed inventory status
  - Monthly profitability
  - Genetic diversity score

### 5.2 Production Reports
- **Breeding Performance**:
  - Conception rates by sire/dam
  - Litter size trends
  - Piglet survival rates
  - Farrowing interval analysis
  - Sow lifecycle analysis

- **Growth Performance**:
  - Average Daily Gain by stage
  - Feed Conversion Ratio trends
  - Weight at age benchmarks
  - Mortality and morbidity by stage

- **Health Reports**:
  - Disease prevalence over time
  - Antibiotic usage
  - Vaccination compliance
  - Treatment cost analysis

- **Feed & Nutrition**:
  - Feed usage by stage/type
  - Cost per kg of gain
  - Nutritional deficiency incidents
  - Supplier performance (quality/cost)

### 5.3 Genetic Reporting
- **Lineage analysis**:
  - Performance of each genetic line
  - Inbreeding levels by lineage
  - Genetic diversity index
  - Ancestor contribution to current population

- **Breeding recommendations**:
  - Suggested sire/dam pairs
  - Genetic improvement potential
  - Risk assessment for proposed matings

---

## 6. TECHNICAL ARCHITECTURE

### 6.1 Technology Stack Recommendation

**Frontend**:
- React.js or Vue.js (responsive web + mobile)
- Charts: Chart.js or D3.js
- Pedigree visualization: Cytoscape.js or similar
- State management: Redux or Vuex

**Backend**:
- Node.js/Express or Python/Django
- GraphQL or REST API
- Real-time updates: WebSocket or Server-Sent Events

**Database**:
- PostgreSQL (relational, good for genealogy queries)
- Redis (caching, real-time data)
- File storage: S3 or similar (for photos, documents)

**Additional Tools**:
- Background jobs: Bull/Celery (for scheduled reports)
- PDF generation: ReportLab or similar
- Email notifications: Nodemailer/SendGrid
- Authentication: JWT or OAuth2

### 6.2 Data Schema Key Tables

```
Tables (PostgreSQL):
├─ animals (pig, date_birth, breed, sex, status, etc.)
├─ pedigree (animal_id, mother_id, father_id)
├─ breeding_records (dam_id, sire_id, date_bred, farrowing_date, etc.)
├─ litters (breeding_id, piglet_count, survival_rate, etc.)
├─ health_records (animal_id, date, condition, treatment, cost, etc.)
├─ vaccinations (animal_id, vaccine_type, date, lot_number, next_due)
├─ feed_inventory (feed_type, quantity, cost, expiration, etc.)
├─ feeding_records (animal_id, feed_type, quantity, date, etc.)
├─ pens (pen_id, capacity, current_occupancy, type, etc.)
├─ users (user_id, name, role, permissions, etc.)
├─ financial_records (transaction_id, category, amount, date, etc.)
└─ alerts (alert_id, type, animal_id, message, resolved, etc.)

Indexes needed on:
- animal_id (frequent lookups)
- mother_id, father_id (pedigree traversal)
- date fields (range queries)
- status (filtering)
```

### 6.3 API Endpoints (Example REST)

```
ANIMALS:
GET    /api/animals
GET    /api/animals/{id}
POST   /api/animals
PATCH  /api/animals/{id}
DELETE /api/animals/{id} (mark as inactive)

PEDIGREE:
GET    /api/animals/{id}/pedigree (full ancestry tree)
GET    /api/animals/{id}/descendants
GET    /api/pedigree/distance?animal1=X&animal2=Y (genetic distance)

BREEDING:
GET    /api/animals/{id}/breeding-matches (recommended sires)
POST   /api/breeding-records (record a breeding)
GET    /api/breeding-records/{id}
PATCH  /api/breeding-records/{id} (update farrowing outcome)

HEALTH:
GET    /api/animals/{id}/health-records
POST   /api/health-records
GET    /api/health/disease-prevalence (current outbreak status)
GET    /api/alerts (dashboard alerts)

FEED:
GET    /api/feed-inventory
POST   /api/feeding-records
GET    /api/feed/consumption-analysis

FINANCIAL:
GET    /api/financials/summary
GET    /api/financials/costs
GET    /api/financials/revenue
GET    /api/reports/profitability

REPORTS:
GET    /api/reports/breeding-summary
GET    /api/reports/growth-performance
GET    /api/reports/health-summary
POST   /api/reports/export-pdf
```

---

## 7. IMPLEMENTATION ROADMAP

### Phase 1: MVP (Months 1-3)
- [ ] Basic animal management (create, edit, delete, view)
- [ ] Pedigree tracking (basic parent/offspring relationships)
- [ ] Simple breeding match finder (siblings/parent-offspring prevention)
- [ ] Health record entry (basic CRUD)
- [ ] Feed inventory tracking
- [ ] Basic dashboard

### Phase 2: Core Features (Months 4-6)
- [ ] Advanced pedigree visualization (family tree)
- [ ] Inbreeding coefficient calculation
- [ ] Full breeding recommendation algorithm
- [ ] Breeding calendar and farrowing tracking
- [ ] Vaccination schedule management
- [ ] Feeding program customization
- [ ] Basic reporting (charts, growth trends)

### Phase 3: Analytics & Intelligence (Months 7-9)
- [ ] Financial tracking and profitability analysis
- [ ] Performance analytics (genetic, health, production)
- [ ] Disease monitoring and alerts
- [ ] Advanced feed optimization
- [ ] Detailed genetic reporting
- [ ] Predictive alerts (health, breeding readiness)

### Phase 4: Optimization & Scale (Months 10-12)
- [ ] Mobile app (iOS/Android)
- [ ] Offline sync capability
- [ ] Multi-farm support
- [ ] User roles and permissions
- [ ] Integration with external data (breed registries, etc.)
- [ ] Advanced forecasting and planning tools

---

## 8. DATA VALIDATION & BUSINESS RULES

### 8.1 Animal Management Rules
- Age validation: Cannot breed before minimum age (breed-specific: 6-8 months for females)
- Cannot record breeding for deceased animals
- Cannot move deceased animals to pens
- Sex-appropriate role assignment (boars as sires, sows as dams)

### 8.2 Breeding Rules
- Cannot breed before puberty/minimum weight
- Cannot breed the same pair twice without gestation period between
- Farrowing date must be ~21 days after breeding (±3 days)
- Cannot record litter if farrowing date not reached

### 8.3 Health Rules
- Medication withdrawal periods must be tracked
- Cannot sell/slaughter animals within withdrawal period
- Vaccination dates cannot be in future
- Health record date cannot be before animal's birth date

### 8.4 Feed Rules
- Consumption cannot exceed allocated amount by >10% (data entry check)
- Expired feed cannot be allocated to animals
- Feed stage must match animal's age/weight

---

## 9. SECURITY & COMPLIANCE

### 9.1 Data Security
- Role-based access control (RBAC)
- Encryption of sensitive data at rest
- HTTPS for all communications
- Regular database backups
- Audit logging for critical actions

### 9.2 Regulatory Compliance
- **Animal Welfare**: Track health, breeding practices
- **Food Safety**: Medication withdrawal periods, biosecurity
- **Financial Tracking**: For tax and subsidy purposes
- **Breed Registry Compliance**: If registering animals

### 9.3 Data Privacy
- User account management
- Permission levels:
  - Admin (system access)
  - Manager (full farm data access)
  - Veterinarian (health records only)
  - Worker (data entry only, limited viewing)

---

## 10. FUTURE ENHANCEMENTS & INTEGRATIONS

### 10.1 Possible Integrations
- **Genetic databases**: Import breed registries, genomic data
- **Weather data**: Correlate health/performance to weather
- **Market data**: Track feed/piglet prices for financial planning
- **ERP Systems**: Sync with general farm accounting software
- **IoT sensors**: Real-time monitoring of pen conditions, weights
- **Veterinary software**: Integration with vet records systems

### 10.2 Advanced Features
- **AI/ML for predictions**:
  - Predict farrowing complications
  - Predict disease outbreaks
  - Optimize breeding combinations for specific traits
  - Suggest feed optimization based on genetics
  
- **Genomic selection**:
  - DNA testing integration
  - Genomic breeding values (GEBVs)
  - Marker-assisted selection
  
- **Sustainability tracking**:
  - Carbon footprint analysis
  - Water usage monitoring
  - Waste management optimization

---

## 11. SUCCESS METRICS

### 11.1 Breeding Success
- Conception rate improvement
- Litter size consistency
- Reduction in genetic defects
- Maintenance of genetic diversity (target F < 5%)
- Reduced culling due to genetic issues

### 11.2 Production Success
- Average Daily Gain improvement
- Feed Conversion Ratio optimization
- Mortality rate reduction
- Disease incidence reduction
- Time from birth to market reduction

### 11.3 Financial Success
- Cost per kg of gain reduction
- Revenue per pig increase
- Profitability per breeding female increase
- ROI on system investment
- Labor efficiency improvement

### 11.4 Operational Success
- Reduced manual record-keeping time
- Data consistency and integrity
- Faster decision-making
- Reduced compliance issues
- Better breeding plan execution

---

## 12. GLOSSARY & DEFINITIONS

- **ADG (Average Daily Gain)**: Average weight gain per day
- **FCR (Feed Conversion Ratio)**: kg of feed required to gain 1 kg of body weight
- **F (Inbreeding Coefficient)**: Probability that alleles at a locus are identical by descent (0-1)
- **Farrowing**: Process of giving birth (sows)
- **Gilt**: Young female pig (not yet farrowed)
- **Boar**: Male pig (breeding)
- **Sow**: Female pig (breeding)
- **Parity**: Number of litters a sow has had
- **Stillborn**: Piglet born dead
- **Mummified piglet**: Dead piglet retained in womb, appears dried up
- **Dystocia**: Difficult or obstructed birth
- **Estrus/Heat**: Period of fertility in female pig (~21-day cycle)
- **Congenital**: Present from birth
- **Biosecurity**: Practices to prevent disease transmission

---

## FINAL CHECKLIST FOR IMPLEMENTATION

Before starting development, confirm:
- [ ] Stakeholder sign-off on feature list
- [ ] Database design peer-reviewed by team
- [ ] UI/UX mockups created and approved
- [ ] Testing strategy defined
- [ ] Deployment and hosting plan finalized
- [ ] Training materials plan in place
- [ ] Data migration strategy (from existing records)
- [ ] Support and maintenance plan established
