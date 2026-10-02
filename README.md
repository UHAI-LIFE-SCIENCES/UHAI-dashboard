# UHAI-dashboard
## Overview

The UHAI Blood Dashboard is an interactive data visualization platform designed to provide insights into blood sourcing, processing, distribution, and transfusion demand.

The dashboard is being developed as part of UHAI's broader initiative to use data, predictive modelling, and digital tools to improve blood-product supply chain management.

The current version is a **Proof of Concept (POC)** developed using synthetic data. The purpose of the POC is to validate the proposed data structure, visualizations, dashboard functionality, and analytical approach before integrating real hospital data.

---

## Project Objectives

The dashboard aims to:

- Provide a centralized view of blood supply-chain data.
- Visualize blood sourcing and donation patterns.
- Monitor blood processing and screening outcomes.
- Track blood-product distribution.
- Analyze blood transfusion requests and fulfilment.
- Identify trends in blood-group and blood-product utilization.
- Provide an interactive interface for exploring historical data.
- Provide a foundation for integrating predictive forecasting models.

---

## Project Scope

The project currently focuses on four major areas of the blood supply chain:

### 1. Blood Transfusion Unit (BTU)

The BTU data focuses on patient-level blood requirements and fulfilment.

Current fields include:

- Patient ID
- Condition
- Blood Group
- Quantity Requested
- Blood Product Requested
- Fulfilment / What Was Given
- Hb Level

This dataset will support analysis of blood demand, patient conditions, blood-group utilization, and requested versus fulfilled blood products.

### 2. Sourcing

The sourcing data focuses on blood donation and collection.

Current fields include:

- Donor ID
- Blood Group
- Blood Product
- Voluntary / Replacement
- Products Generated

This section will support analysis of donor and blood-product sourcing patterns.

### 3. Processing

The processing data focuses on the handling and screening of collected blood.

Current fields include:

- Blood Received
- Source: In-house / Mobile
- Screening Failure Rate / Hard TTIs
- Products Generated
- Amounts Distributed
- Blood Groups

This section will support analysis of blood processing and screening outcomes.

### 4. Dispatch / Distribution

The dispatch and distribution data focuses on movement of blood products to recipient facilities.

Current fields include:

- Type of Product
- Quantity
- Recipient Facility

This section will support analysis of blood-product distribution across facilities.

---
