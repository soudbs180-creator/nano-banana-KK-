# Nano-banana 官方格式 gemini-3-pro-image-preview

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /v1beta/models/gemini-2.5-flash-image:generateContent:
    post:
      summary: Nano-banana 官方格式 gemini-3-pro-image-preview
      deprecated: false
      description: >-
        官方文档：

        https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn#aspect_ratios
      tags:
        - 绘图模型/OpenAI Dall-e 格式
      parameters:
        - name: Content-Type
          in: header
          description: ''
          required: true
          example: application/json
          schema:
            type: string
        - name: Authorization
          in: header
          description: ''
          required: false
          example: Bearer {{YOUR_API_KEY}}
          schema:
            type: string
            default: Bearer {{YOUR_API_KEY}}
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                contents:
                  type: array
                  items:
                    type: object
                    properties:
                      parts:
                        type: array
                        items:
                          type: object
                          properties:
                            inlineData:
                              type: object
                              properties:
                                data:
                                  type: string
                                mimeType:
                                  type: string
                              required:
                                - data
                                - mimeType
                              x-apifox-orders:
                                - data
                                - mimeType
                            text:
                              type: string
                          required:
                            - inlineData
                          x-apifox-orders:
                            - inlineData
                            - text
                      role:
                        type: string
                    x-apifox-orders:
                      - parts
                      - role
                generationConfig:
                  type: object
                  properties:
                    imageConfig:
                      type: object
                      properties:
                        aspectRatio:
                          type: string
                        imageSize:
                          type: string
                          enum:
                            - 1K
                            - 2K
                            - 4K
                          x-apifox-enum:
                            - value: 1K
                              name: ''
                              description: ''
                            - value: 2K
                              name: ''
                              description: ''
                            - value: 4K
                              name: ''
                              description: ''
                      x-apifox-orders:
                        - aspectRatio
                        - imageSize
                    responseModalities:
                      type: array
                      items:
                        type: string
                  x-apifox-orders:
                    - imageConfig
                    - responseModalities
              required:
                - contents
              x-apifox-orders:
                - contents
                - generationConfig
            example:
              contents:
                - parts:
                    - inlineData:
                        data: iVBORw0KGgoAAAANSUh.....
                        mimeType: image/png
                    - inlineData:
                        data: iVBORw0KGgoAAAANSUh.....
                        mimeType: image/png
                    - text: hi
                  role: user
              generationConfig:
                imageConfig:
                  aspectRatio: '3:4'
                responseModalities:
                  - IMAGE
      responses:
        '200':
          description: ''
          content:
            application/json:
              schema:
                type: object
                properties: {}
          headers: {}
          x-apifox-name: 成功
      security: []
      x-apifox-folder: 绘图模型/OpenAI Dall-e 格式
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/3868318/apis/api-363472251-run
components:
  schemas: {}
  securitySchemes: {}
servers: []
security: []

```
