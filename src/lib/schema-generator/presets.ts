import { PresetPayload } from '../../types/schema';

export const PRESET_PAYLOADS: PresetPayload[] = [
  {
    id: 'ecommerce-order',
    name: 'E-Commerce Order & Fulfillment',
    category: 'E-Commerce',
    description: 'Comprehensive store checkout payload with customer, discounts, shipping, line items, and audit timestamps.',
    data: {
      orderId: "ord_9942a1b7",
      orderNumber: 10482,
      createdAt: "2026-09-09T14:32:00Z",
      status: "processing",
      currency: "USD",
      subtotal: 189.50,
      taxAmount: 15.16,
      shippingAmount: 0.00,
      totalAmount: 204.66,
      customer: {
        id: "usr_4483a992-cf12-45e3-99b3-1f19c961e0b5",
        name: "Elena Rostova",
        email: "elena.rostova@example.com",
        isRegistered: true,
        phone: "+1-555-0199",
        loyaltyTier: "gold",
        tags: ["vip", "early-adopter"]
      },
      shippingAddress: {
        recipientName: "Elena Rostova",
        streetLine1: "742 Evergreen Terrace",
        streetLine2: "Suite 4B",
        city: "Springfield",
        state: "OR",
        postalCode: "97477",
        countryCode: "US",
        coordinates: {
          latitude: 44.0462,
          longitude: -123.0220
        }
      },
      lineItems: [
        {
          id: "item_01",
          sku: "TECH-KB-PRO-BLK",
          title: "Mechanical Keyboard - Wireless 75%",
          unitPrice: 149.50,
          quantity: 1,
          discount: {
            code: "FALLTECH10",
            discountPercentage: 10,
            amountDeducted: 14.95
          },
          inStock: true
        },
        {
          id: "item_02",
          sku: "ACC-CBL-COIL-SLV",
          title: "Custom Coiled Aviator USB-C Cable",
          unitPrice: 40.00,
          quantity: 1,
          discount: null,
          inStock: true
        }
      ],
      paymentDetails: {
        method: "credit_card",
        gatewayTransactionId: "txn_3N82v2L9xXy001",
        lastFourDigits: "4242",
        brand: "visa",
        paidAt: "2026-09-09T14:32:04Z"
      }
    }
  },
  {
    id: 'stripe-webhook',
    name: 'Stripe Payment Webhook Event',
    category: 'Fintech & Payments',
    description: 'Production webhook payload for payment_intent.succeeded with metadata and charges.',
    data: {
      id: "evt_3MtwfyLkdIwHu7ix28a3tqPa",
      object: "event",
      api_version: "2024-06-20",
      created: 1778930211,
      type: "payment_intent.succeeded",
      livemode: true,
      pending_webhooks: 1,
      request: {
        id: "req_f88vA9Kz8Qn91J",
        idempotency_key: "626ff8f8-b391-4963-b82b-65c3b9b4f997"
      },
      data: {
        object: {
          id: "pi_3MtwfyLkdIwHu7ix28a3tqPa",
          object: "payment_intent",
          amount: 5400,
          amount_capturable: 0,
          amount_received: 5400,
          currency: "usd",
          customer: "cus_Nhx3k2hA9aK1L0",
          description: "Enterprise Monthly Subscription - Team Plan",
          status: "succeeded",
          statement_descriptor_suffix: "CLOUD-SYNC",
          metadata: {
            organization_id: "org_77192",
            tier: "enterprise_standard",
            seat_count: "25"
          },
          payment_method_types: ["card"],
          receipt_email: "billing@acmecorp.dev",
          canceled_at: null,
          cancellation_reason: null
        }
      }
    }
  },
  {
    id: 'github-repo',
    name: 'GitHub Repository & Collaborator',
    category: 'Developer Tools',
    description: 'REST API response containing repository metadata, licensing, metrics, and owner identity.',
    data: {
      id: 81290312,
      node_id: "MDEwOlJlcG9zaXRvcnk4MTI5MDMxMg==",
      name: "typeforge-core",
      full_name: "antigravity-labs/typeforge-core",
      private: false,
      owner: {
        login: "antigravity-labs",
        id: 1948271,
        avatar_url: "https://avatars.githubusercontent.com/u/1948271?v=4",
        html_url: "https://github.com/antigravity-labs",
        type: "Organization",
        site_admin: false
      },
      html_url: "https://github.com/antigravity-labs/typeforge-core",
      description: "Blazing fast JSON to TypeScript, TypeBox, and Zod AST inference engine.",
      fork: false,
      url: "https://api.github.com/repos/antigravity-labs/typeforge-core",
      created_at: "2024-03-15T09:12:45Z",
      updated_at: "2026-09-08T22:15:00Z",
      pushed_at: "2026-09-09T04:10:19Z",
      stargazers_count: 3840,
      watchers_count: 3840,
      language: "TypeScript",
      forks_count: 142,
      open_issues_count: 7,
      license: {
        key: "mit",
        name: "MIT License",
        spdx_id: "MIT",
        url: "https://api.github.com/licenses/mit"
      },
      topics: ["typescript", "zod", "typebox", "schema-generator", "ast"],
      default_branch: "main"
    }
  },
  {
    id: 'iot-telemetry',
    name: 'Real-time IoT Sensor Telemetry',
    category: 'IoT & Telemetry',
    description: 'Hardware edge telemetry payload with multiple readings, geo coordinates, and battery health.',
    data: {
      deviceId: "sensor_station_west_04",
      firmwareVersion: "v3.2.1-prod",
      timestamp: "2026-09-09T13:20:45.192Z",
      connection: {
        networkType: "cellular-nb-iot",
        signalStrengthDbm: -72,
        carrier: "GlobalSim Telecom"
      },
      environment: {
        temperatureCelsius: 22.4,
        relativeHumidityPercent: 48.2,
        barometricPressureHpa: 1013.25,
        airQualityIndex: 32,
        particulateMatter2_5: 4.8
      },
      geo: {
        latitude: 37.7749,
        longitude: -122.4194,
        altitudeMeters: 18.5,
        gpsFixQuality: "3d-differential"
      },
      battery: {
        percentage: 89.2,
        voltage: 4.12,
        isSolarCharging: true
      },
      statusFlags: ["nominal", "low_drift", "solar_active"]
    }
  },
  {
    id: 'k8s-pod',
    name: 'Kubernetes Pod Deployment Spec',
    category: 'Cloud & DevOps',
    description: 'Cloud native container orchestration configuration with ports, env vars, and resource constraints.',
    data: {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: "auth-service-pod-77d84bf-9xk2p",
        namespace: "production",
        labels: {
          app: "auth-service",
          tier: "backend",
          release: "2026.09.1"
        }
      },
      spec: {
        restartPolicy: "Always",
        containers: [
          {
            name: "auth-api",
            image: "registry.company.internal/services/auth:v2.10.4",
            imagePullPolicy: "IfNotPresent",
            ports: [
              {
                containerPort: 8080,
                protocol: "TCP",
                name: "http"
              },
              {
                containerPort: 9090,
                protocol: "TCP",
                name: "metrics"
              }
            ],
            resources: {
              limits: {
                cpu: "1000m",
                memory: "1Gi"
              },
              requests: {
                cpu: "250m",
                memory: "256Mi"
              }
            }
          }
        ]
      }
    }
  }
];
