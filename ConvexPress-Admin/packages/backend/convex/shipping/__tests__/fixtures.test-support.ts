/**
 * Shipping System - Test Fixtures
 *
 * Mock API response fixtures for all supported carriers.
 * Shapes match the real response formats from each carrier's API.
 *
 * Carriers covered:
 *   - UPS (Rate, Ship, Tracking)
 *   - USPS (Rate, Tracking)
 *   - FedEx (Rate, Ship, Tracking)
 *   - DHL (Rate)
 *   - ShipStation (Rate, Label, Tracking)
 */

// ─── UPS Fixtures ─────────────────────────────────────────────────────────────

/** UPS Rate API response — 3 services: Ground, 2nd Day Air, Next Day Air */
export const UPS_RATE_RESPONSE = {
  RateResponse: {
    Response: {
      ResponseStatus: { Code: "1", Description: "Success" },
    },
    RatedShipment: [
      {
        Service: { Code: "03", Description: "UPS Ground" },
        BillingWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: "2.0" },
        TransportationCharges: { CurrencyCode: "USD", MonetaryValue: "12.50" },
        ServiceOptionsCharges: { CurrencyCode: "USD", MonetaryValue: "0.00" },
        TotalCharges: { CurrencyCode: "USD", MonetaryValue: "12.50" },
        NegotiatedRateCharges: {
          TotalCharge: { CurrencyCode: "USD", MonetaryValue: "10.75" },
        },
        GuaranteedDelivery: {
          BusinessDaysInTransit: "5",
          DeliveryByTime: "",
        },
      },
      {
        Service: { Code: "02", Description: "UPS 2nd Day Air" },
        BillingWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: "2.0" },
        TransportationCharges: { CurrencyCode: "USD", MonetaryValue: "28.00" },
        ServiceOptionsCharges: { CurrencyCode: "USD", MonetaryValue: "0.00" },
        TotalCharges: { CurrencyCode: "USD", MonetaryValue: "28.00" },
        NegotiatedRateCharges: {
          TotalCharge: { CurrencyCode: "USD", MonetaryValue: "24.50" },
        },
        GuaranteedDelivery: {
          BusinessDaysInTransit: "2",
          DeliveryByTime: "23:00",
        },
      },
      {
        Service: { Code: "01", Description: "UPS Next Day Air" },
        BillingWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: "2.0" },
        TransportationCharges: { CurrencyCode: "USD", MonetaryValue: "45.00" },
        ServiceOptionsCharges: { CurrencyCode: "USD", MonetaryValue: "0.00" },
        TotalCharges: { CurrencyCode: "USD", MonetaryValue: "45.00" },
        NegotiatedRateCharges: {
          TotalCharge: { CurrencyCode: "USD", MonetaryValue: "38.25" },
        },
        GuaranteedDelivery: {
          BusinessDaysInTransit: "1",
          DeliveryByTime: "10:30",
        },
      },
    ],
  },
};

/** UPS Ship API response */
export const UPS_SHIP_RESPONSE = {
  ShipmentResponse: {
    Response: {
      ResponseStatus: { Code: "1", Description: "Success" },
      TransactionReference: { CustomerContext: "ShipRequest" },
    },
    ShipmentResults: {
      ShipmentIdentificationNumber: "1Z999AA10123456784",
      PackageResults: {
        TrackingNumber: "1Z999AA10123456784",
        ServiceOptionsCharges: { CurrencyCode: "USD", MonetaryValue: "0.00" },
        ShippingLabel: {
          ImageFormat: { Code: "GIF", Description: "GIF" },
          GraphicImage:
            "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
          HTMLImage: "",
        },
      },
      ShipmentCharges: {
        TransportationCharges: { CurrencyCode: "USD", MonetaryValue: "12.50" },
        TotalCharges: { CurrencyCode: "USD", MonetaryValue: "12.50" },
      },
    },
  },
};

/** UPS Tracking API response */
export const UPS_TRACKING_RESPONSE = {
  trackResponse: {
    shipment: [
      {
        inquiryNumber: "1Z999AA10123456784",
        package: [
          {
            trackingNumber: "1Z999AA10123456784",
            activity: [
              {
                location: {
                  address: {
                    city: "Louisville",
                    stateProvince: "KY",
                    countryCode: "US",
                    postalCode: "40213",
                  },
                  slic: "0437",
                },
                status: {
                  type: "D",
                  description: "DELIVERED",
                  code: "FS",
                },
                date: "20240315",
                time: "143200",
              },
              {
                location: {
                  address: {
                    city: "Louisville",
                    stateProvince: "KY",
                    countryCode: "US",
                    postalCode: "40213",
                  },
                },
                status: {
                  type: "I",
                  description: "OUT FOR DELIVERY",
                  code: "OT",
                },
                date: "20240315",
                time: "083100",
              },
            ],
            currentStatus: {
              type: "D",
              description: "DELIVERED",
              code: "FS",
              simplifiedTextDescription: "Delivered",
            },
            deliveryDate: [{ type: "DEL", date: "20240315" }],
          },
        ],
      },
    ],
  },
};

// ─── USPS Fixtures ────────────────────────────────────────────────────────────

/** USPS Rate API v3 response — 3 services */
export const USPS_RATE_RESPONSE = {
  prices: [
    {
      mailClass: "USPS_GROUND_ADVANTAGE",
      priceType: "RETAIL",
      totalBasePrice: 4.75,
      fees: [],
      totalPrice: 4.75,
      startDate: "2024-01-21",
      endDate: "",
      expectedDeliveryDays: 5,
      SKU: "DVXR0XXXXXX0100",
      description: "USPS Ground Advantage",
    },
    {
      mailClass: "PRIORITY_MAIL",
      priceType: "RETAIL",
      totalBasePrice: 8.95,
      fees: [],
      totalPrice: 8.95,
      startDate: "2024-01-21",
      endDate: "",
      expectedDeliveryDays: 3,
      SKU: "DVXR0XXXXXX0200",
      description: "Priority Mail",
    },
    {
      mailClass: "PRIORITY_MAIL_EXPRESS",
      priceType: "RETAIL",
      totalBasePrice: 26.35,
      fees: [],
      totalPrice: 26.35,
      startDate: "2024-01-21",
      endDate: "",
      expectedDeliveryDays: 1,
      SKU: "DVXR0XXXXXX0300",
      description: "Priority Mail Express",
    },
  ],
};

/** USPS Tracking API response */
export const USPS_TRACKING_RESPONSE = {
  trackingNumber: "9400111899223397935272",
  additionalInfo: "Your item was delivered.",
  ADPScripting: "",
  archiveRestoreInfo: "",
  associatedLabel: "",
  carrierRelease: false,
  destinationCity: "LOUISVILLE",
  destinationCountryCode: "US",
  destinationState: "KY",
  destinationZIP: "40213",
  editedLabelTrackingId: "9400111899223397935272",
  expectedDeliveryTimeStamp: "2024-03-15T23:59:00Z",
  expectedDeliveryType: "by",
  guaranteedDelivery: false,
  originCity: "MEMPHIS",
  originState: "TN",
  originZIP: "38101",
  proofOfDeliveryEnabled: false,
  relatedReturnLabel: null,
  redeliveryEnabled: false,
  restoreEnabled: false,
  returnDateNotice: null,
  returnLabel: null,
  statusCategory: "Delivered",
  status: "delivered",
  statusSummary: "Your item was delivered on March 15, 2024.",
  trackSummary: {
    EventTime: "2:43 pm",
    EventDate: "March 15, 2024",
    Event: "DELIVERED",
    EventCity: "LOUISVILLE",
    EventState: "KY",
    EventZIPCode: "40213",
    EventCountry: "",
    FirmName: "",
    Name: "JOHN DOE",
    AuthorizedAgent: "false",
    DeliveryAttributeCode: "01",
  },
  trackDetail: [],
};

// ─── FedEx Fixtures ───────────────────────────────────────────────────────────

/** FedEx Rate API response — 3 services */
export const FEDEX_RATE_RESPONSE = {
  transactionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  customerTransactionId: "ShipRateRequest",
  output: {
    alerts: [],
    rateReplyDetails: [
      {
        serviceType: "FEDEX_GROUND",
        serviceName: "FedEx Ground",
        packagingType: "YOUR_PACKAGING",
        ratedShipmentDetails: [
          {
            rateType: "ACCOUNT",
            ratedWeightMethod: "ACTUAL",
            totalDiscounts: 0,
            totalBaseCharge: 12.75,
            totalNetCharge: 12.75,
            totalNetFedExCharge: 12.75,
            shipmentRateDetail: {
              rateZone: "3",
              dimDivisor: 0,
              fuelSurchargePercent: 8.5,
              totalSurcharges: 1.08,
              totalFreightDiscount: 0,
              surCharges: [
                { type: "FUEL", description: "Fuel Surcharge", amount: 1.08 },
              ],
            },
            currency: "USD",
          },
        ],
        operationalDetail: { transitDays: "FIVE_DAYS", ineligibleForMoneyBackGuarantee: false },
        commit: {
          dateDetail: { dayFormat: "ddd, D MMM YYYY", dayOfWeek: "Thu", calculated: "2024-03-20", display: "20 Mar 2024", expressed: "2024-03-20" },
          label: "Estimated delivery",
          commitMessageDetails: "",
          commodityName: "",
          deliveryMessages: [],
          derivedOriginDetail: { countryCode: "US", stateOrProvinceCode: "TN", postalCode: "38101" },
          derivedDestinationDetail: { countryCode: "US", stateOrProvinceCode: "KY", postalCode: "40213" },
          saturdayDelivery: false,
          transitDays: "FIVE_DAYS",
        },
      },
      {
        serviceType: "FEDEX_2_DAY",
        serviceName: "FedEx 2Day",
        packagingType: "YOUR_PACKAGING",
        ratedShipmentDetails: [
          {
            rateType: "ACCOUNT",
            ratedWeightMethod: "ACTUAL",
            totalDiscounts: 0,
            totalBaseCharge: 29.50,
            totalNetCharge: 29.50,
            totalNetFedExCharge: 29.50,
            shipmentRateDetail: {
              rateZone: "3",
              dimDivisor: 0,
              fuelSurchargePercent: 8.5,
              totalSurcharges: 2.51,
              totalFreightDiscount: 0,
              surCharges: [
                { type: "FUEL", description: "Fuel Surcharge", amount: 2.51 },
              ],
            },
            currency: "USD",
          },
        ],
        operationalDetail: { transitDays: "TWO_DAYS", ineligibleForMoneyBackGuarantee: false },
        commit: {
          dateDetail: { dayFormat: "ddd, D MMM YYYY", dayOfWeek: "Mon", calculated: "2024-03-17", display: "17 Mar 2024", expressed: "2024-03-17" },
          label: "Estimated delivery",
          commitMessageDetails: "",
          commodityName: "",
          deliveryMessages: [],
          derivedOriginDetail: { countryCode: "US", stateOrProvinceCode: "TN", postalCode: "38101" },
          derivedDestinationDetail: { countryCode: "US", stateOrProvinceCode: "KY", postalCode: "40213" },
          saturdayDelivery: false,
          transitDays: "TWO_DAYS",
        },
      },
      {
        serviceType: "STANDARD_OVERNIGHT",
        serviceName: "FedEx Standard Overnight",
        packagingType: "YOUR_PACKAGING",
        ratedShipmentDetails: [
          {
            rateType: "ACCOUNT",
            ratedWeightMethod: "ACTUAL",
            totalDiscounts: 0,
            totalBaseCharge: 48.25,
            totalNetCharge: 48.25,
            totalNetFedExCharge: 48.25,
            shipmentRateDetail: {
              rateZone: "3",
              dimDivisor: 0,
              fuelSurchargePercent: 8.5,
              totalSurcharges: 4.10,
              totalFreightDiscount: 0,
              surCharges: [
                { type: "FUEL", description: "Fuel Surcharge", amount: 4.10 },
              ],
            },
            currency: "USD",
          },
        ],
        operationalDetail: { transitDays: "ONE_DAY", ineligibleForMoneyBackGuarantee: false },
        commit: {
          dateDetail: { dayFormat: "ddd, D MMM YYYY", dayOfWeek: "Fri", calculated: "2024-03-15", display: "15 Mar 2024", expressed: "2024-03-15" },
          label: "Estimated delivery",
          commitMessageDetails: "",
          commodityName: "",
          deliveryMessages: [],
          derivedOriginDetail: { countryCode: "US", stateOrProvinceCode: "TN", postalCode: "38101" },
          derivedDestinationDetail: { countryCode: "US", stateOrProvinceCode: "KY", postalCode: "40213" },
          saturdayDelivery: false,
          transitDays: "ONE_DAY",
        },
      },
    ],
    quoteDate: "2024-03-15",
    encoded: false,
  },
};

/** FedEx Ship API response */
export const FEDEX_SHIP_RESPONSE = {
  transactionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567891",
  customerTransactionId: "ShipRequest",
  output: {
    alerts: [],
    transactionShipments: [
      {
        masterTrackingNumber: "774899172137",
        serviceType: "FEDEX_GROUND",
        shipDatestamp: "2024-03-15",
        serviceName: "FedEx Ground",
        shipmentDocuments: [],
        pieceResponses: [
          {
            netRateAmount: 12.75,
            netChargeAmount: 12.75,
            trackingNumber: "774899172137",
            additionalChargesDiscount: 0,
            netDiscountAmount: 0,
            packageDocuments: [
              {
                contentKey: "label",
                copiesToPrint: 1,
                contentType: "LABEL",
                trackingNumber: "774899172137",
                docType: "PDF",
                label: {
                  fileType: "PDF",
                  labelType: "SHIPPING_LABEL_PDF",
                  encodedLabel:
                    "JVBERi0xLjQKJ... (base64 truncated for fixture)",
                  contentKey: "label",
                },
                url: null,
              },
            ],
            acceptanceTrackingNumber: "774899172137",
            serviceCategory: "EXPRESS",
          },
        ],
        completedShipmentDetail: {
          completionMessages: [],
          operationalDetail: { transitDays: "FIVE_DAYS" },
          accessDetail: null,
          chargeDetail: [],
        },
      },
    ],
  },
};

/** FedEx Tracking API response */
export const FEDEX_TRACKING_RESPONSE = {
  transactionId: "a1b2c3d4-e5f6-7890-abcd-ef1234567892",
  customerTransactionId: "TrackRequest",
  output: {
    completeTrackResults: [
      {
        trackingInfo: [
          { requiresAdditionalInformation: false, proNumber: null, shipDateBegin: "2024-03-15", shipDateEnd: "2024-03-15" },
        ],
        trackResults: [
          {
            trackingNumberInfo: {
              trackingNumber: "774899172137",
              trackingNumberUniqueId: "2459824000~774899172137~FX",
              carrierCode: "FDXG",
            },
            additionalTrackingInfo: { nickname: "", packageIdentifiers: [], hasAssociatedShipments: false },
            distanceToDestination: null,
            consolidationDetail: [],
            meterNumber: "118626079",
            returnDetail: null,
            serviceDetail: {
              type: "FEDEX_GROUND",
              shortDescription: "FG",
              description: "FedEx Ground",
            },
            destinationLocation: {
              locationId: "MKEA",
              locationContactAndAddress: {
                address: { city: "LOUISVILLE", stateOrProvinceCode: "KY", countryCode: "US", residential: false, postalCode: "40213" },
              },
              locationType: "DELIVERY_LOCATION",
            },
            latestStatusDetail: {
              code: "DL",
              derivedCode: "DL",
              statusByLocale: "Delivered",
              description: "Delivered",
              scanLocation: { city: "Louisville", stateOrProvinceCode: "KY", countryCode: "US", residential: false, postalCode: "40213" },
            },
            dateAndTimes: [
              { type: "ACTUAL_DELIVERY", dateTime: "2024-03-15T14:43:00-05:00" },
              { type: "ACTUAL_PICKUP", dateTime: "2024-03-13T09:00:00-05:00" },
            ],
            availableImages: [],
            specialHandlings: [],
            availableNotifications: [],
            deliveryDetails: {
              actualDeliveryAddress: { city: "Louisville", stateOrProvinceCode: "KY", countryCode: "US", residential: true, postalCode: "40213" },
              deliveryAttempts: "0",
              deliveryDayOfWeek: "FRI",
              endOfDayCommit: false,
              deliveryToCorrespondentAddress: false,
              signedByName: "",
              locationType: "RESIDENCE",
              locationDescription: "Residence",
              deliveryOptionEligibilityDetails: [],
            },
            scanEvents: [
              {
                date: "2024-03-15T14:43:00-05:00",
                eventType: "DL",
                eventDescription: "Delivered",
                exceptionCode: "",
                exceptionDescription: "",
                scanLocation: { city: "Louisville", stateOrProvinceCode: "KY", countryCode: "US", residential: true, postalCode: "40213" },
                locationId: "MKEA",
                locationType: "CUSTOMER",
                derivedStatusCode: "DL",
                derivedStatus: "Delivered",
              },
            ],
            lastUpdatedTime: "2024-03-15T14:43:38-06:00",
            packageDetails: {
              packagingDescription: { type: "YOUR_PACKAGING", description: "Package" },
              count: "1",
              weightAndDimensions: { weight: [{ value: "2.0", unit: "LB" }] },
              packageContent: [],
            },
            shipmentDetails: { contents: [], beforePossessionStatus: false, weight: [], contentPieceCount: "" },
            reasonDetail: null,
            availableImages2: null,
            returnDetail2: null,
            specialHandlings2: null,
          },
        ],
      },
    ],
    alerts: null,
  },
};

// ─── DHL Fixtures ─────────────────────────────────────────────────────────────

/** DHL Express Rate API response — 2 products */
export const DHL_RATE_RESPONSE = {
  products: [
    {
      productCode: "P",
      productName: "EXPRESS WORLDWIDE",
      localProductCode: "P",
      localProductCountryCode: "US",
      networkTypeCode: "DD",
      isCustomerAgreement: false,
      weight: { provided: "2.0", volumetric: 0.4, provided_unit: "metric", volumetric_unit: "metric" },
      breakdown: [],
      totalPrice: [
        { currencyType: "BILLC", priceCurrency: "USD", price: 38.50 },
        { currencyType: "PULCL", priceCurrency: "USD", price: 38.50 },
        { currencyType: "BASEC", priceCurrency: "USD", price: 38.50 },
      ],
      totalPriceBreakdown: [
        { currencyType: "BILLC", priceCurrency: "USD", price: 38.50, priceBreakdown: [] },
      ],
      detailedPriceBreakdown: [],
      requestedShipmentTimeStamp: "2024-03-15T10:00:00 GMT+00:00",
      isExpressCoreEligible: true,
      deliveryCapabilities: {
        deliveryTypeCode: "EX",
        estimatedDeliveryDateAndTime: "2024-03-18 23:59:00",
        destinationServiceAreaCode: "SDF",
        destinationFacilityAreaCode: "SDF",
        deliveryAdditionalDays: 0,
        deliveryDayOfWeek: 1,
        totalTransitDays: 3,
      },
      serviceCodeList: "P",
      piecesInformation: [],
      warnings: [],
    },
    {
      productCode: "K",
      productName: "EXPRESS 9:00",
      localProductCode: "K",
      localProductCountryCode: "US",
      networkTypeCode: "DD",
      isCustomerAgreement: false,
      weight: { provided: "2.0", volumetric: 0.4, provided_unit: "metric", volumetric_unit: "metric" },
      breakdown: [],
      totalPrice: [
        { currencyType: "BILLC", priceCurrency: "USD", price: 62.75 },
        { currencyType: "PULCL", priceCurrency: "USD", price: 62.75 },
        { currencyType: "BASEC", priceCurrency: "USD", price: 62.75 },
      ],
      totalPriceBreakdown: [
        { currencyType: "BILLC", priceCurrency: "USD", price: 62.75, priceBreakdown: [] },
      ],
      detailedPriceBreakdown: [],
      requestedShipmentTimeStamp: "2024-03-15T10:00:00 GMT+00:00",
      isExpressCoreEligible: false,
      deliveryCapabilities: {
        deliveryTypeCode: "EX",
        estimatedDeliveryDateAndTime: "2024-03-18 09:00:00",
        destinationServiceAreaCode: "SDF",
        destinationFacilityAreaCode: "SDF",
        deliveryAdditionalDays: 0,
        deliveryDayOfWeek: 1,
        totalTransitDays: 3,
      },
      serviceCodeList: "K",
      piecesInformation: [],
      warnings: [],
    },
  ],
  alerts: [],
};

// ─── ShipStation Fixtures ─────────────────────────────────────────────────────

/** ShipStation Rate API response */
export const SHIPSTATION_RATE_RESPONSE = {
  rate_response: {
    carrier_code: "ups",
    service_code: null,
    package_type: null,
    pickup_type: "drop_off",
    calculated_at: "2024-03-15T10:00:00Z",
    is_negotiated_rate: false,
    errors: [],
    invalid_codes: [],
    rates: [
      {
        rate_id: "se-4156744201",
        rate_type: "shipment",
        carrier_id: "se-123456",
        shipping_amount: { currency: "usd", amount: 11.89 },
        insurance_amount: { currency: "usd", amount: 0.0 },
        confirmation_amount: { currency: "usd", amount: 0.0 },
        other_amount: { currency: "usd", amount: 0.0 },
        tax_amount: null,
        total_amount: { currency: "usd", amount: 11.89 },
        trackable: true,
        carrier_code: "ups",
        carrier_friendly_name: "UPS",
        service_code: "ups_ground",
        service_type: "UPS® Ground",
        package_type: "package",
        delivery_days: 5,
        guaranteed_service: false,
        estimated_delivery_date: "2024-03-20T23:59:00Z",
        carrier_delivery_days: "5",
        ship_date: "2024-03-15T00:00:00Z",
        negotiated_rate: false,
        service_code_list_rate_id: null,
        trackable_status: "trackable",
        label_download: { pdf: null, png: null, zpl: null, href: null },
        manifest_download: { href: null },
        requires_manifesting: false,
      },
      {
        rate_id: "se-4156744202",
        rate_type: "shipment",
        carrier_id: "se-123456",
        shipping_amount: { currency: "usd", amount: 42.15 },
        insurance_amount: { currency: "usd", amount: 0.0 },
        confirmation_amount: { currency: "usd", amount: 0.0 },
        other_amount: { currency: "usd", amount: 0.0 },
        tax_amount: null,
        total_amount: { currency: "usd", amount: 42.15 },
        trackable: true,
        carrier_code: "ups",
        carrier_friendly_name: "UPS",
        service_code: "ups_next_day_air",
        service_type: "UPS Next Day Air®",
        package_type: "package",
        delivery_days: 1,
        guaranteed_service: true,
        estimated_delivery_date: "2024-03-16T10:30:00Z",
        carrier_delivery_days: "1",
        ship_date: "2024-03-15T00:00:00Z",
        negotiated_rate: false,
        service_code_list_rate_id: null,
        trackable_status: "trackable",
        label_download: { pdf: null, png: null, zpl: null, href: null },
        manifest_download: { href: null },
        requires_manifesting: false,
      },
    ],
  },
};

/** ShipStation Label creation response */
export const SHIPSTATION_LABEL_RESPONSE = {
  label_id: "se-798081644",
  status: "completed",
  shipment_id: "se-1234567890",
  ship_date: "2024-03-15T00:00:00Z",
  created_at: "2024-03-15T10:00:00Z",
  shipment_cost: { currency: "usd", amount: 11.89 },
  insurance_cost: { currency: "usd", amount: 0.0 },
  tracking_number: "1Z999AA10123456784",
  is_return_label: false,
  rma_number: null,
  is_international: false,
  batch_id: null,
  carrier_id: "se-123456",
  service_code: "ups_ground",
  package_code: "package",
  voided: false,
  voided_at: null,
  label_format: "pdf",
  display_scheme: "label",
  label_layout: "4x6",
  trackable: true,
  label_image_id: null,
  carrier_code: "ups",
  tracking_status: "in_transit",
  label_download: {
    pdf: "https://api.shipstation.com/v2/downloads/labels/se-798081644.pdf",
    png: "https://api.shipstation.com/v2/downloads/labels/se-798081644.png",
    zpl: "https://api.shipstation.com/v2/downloads/labels/se-798081644.zpl",
    href: "https://api.shipstation.com/v2/downloads/labels/se-798081644",
  },
  form_download: null,
  insurance_claim: null,
  packages: [],
  tracking_url:
    "https://www.ups.com/track?tracknum=1Z999AA10123456784",
};

/** ShipStation Tracking response */
export const SHIPSTATION_TRACKING_RESPONSE = {
  tracking_number: "1Z999AA10123456784",
  status_code: "delivered",
  carrier_code: "ups",
  carrier_id: "se-123456",
  carrier_detail_code: null,
  status_description: "Delivered",
  carrier_status_code: "D",
  carrier_status_description: "DELIVERED",
  ship_date: "2024-03-13T00:00:00Z",
  estimated_delivery_date: "2024-03-20T23:59:00Z",
  actual_delivery_date: "2024-03-15T14:43:00Z",
  exception_description: null,
  events: [
    {
      occurred_at: "2024-03-15T14:43:00Z",
      carrier_occurred_at: "2024-03-15T19:43:00Z",
      description: "Delivered",
      city_locality: "Louisville",
      state_province: "KY",
      postal_code: "40213",
      country_code: "US",
      company_name: "",
      signer: "JOHN DOE",
      event_code: "D",
      status_code: "delivered",
    },
  ],
  tracking_status: "delivered",
};
