import { AspectRatio } from '../types';

export const CARD_WIDTHS = {
    LANDSCAPE: 320,
    SQUARE: 280,
    PORTRAIT: 240, // Increased from 200 for better text fit
};

export const FOOTER_HEIGHT = 40; // Standard footer height for Image Cards

/**
 * Returns the dimensions for a card based on aspect ratio.
 * @param aspectRatio The aspect ratio of the image/card
 * @param includeFooter Whether to include the footer height (for Image Cards)
 */
export const getCardDimensions = (aspectRatio?: AspectRatio, includeFooter: boolean = false) => {
    let width = CARD_WIDTHS.SQUARE;
    let imageHeight = 280; // Default 1:1

    if (!aspectRatio) {
        return {
            width: CARD_WIDTHS.SQUARE,
            imageHeight: 280,
            totalHeight: 280 + (includeFooter ? FOOTER_HEIGHT : 0)
        };
    }

    switch (aspectRatio) {
        case AspectRatio.LANDSCAPE_16_9:
        case AspectRatio.LANDSCAPE_21_9:
        case AspectRatio.LANDSCAPE_4_1:
        case AspectRatio.LANDSCAPE_8_1:
            width = CARD_WIDTHS.LANDSCAPE;
            if (aspectRatio === AspectRatio.LANDSCAPE_21_9) imageHeight = 137;
            else if (aspectRatio === AspectRatio.LANDSCAPE_4_1) imageHeight = 80;
            else if (aspectRatio === AspectRatio.LANDSCAPE_8_1) imageHeight = 40;
            else imageHeight = 180; // 16:9
            break;

        case AspectRatio.LANDSCAPE_4_3:
        case AspectRatio.LANDSCAPE_5_4:
            width = CARD_WIDTHS.LANDSCAPE;
            imageHeight = aspectRatio === AspectRatio.LANDSCAPE_5_4 ? 256 : 240;
            break;

        case AspectRatio.STANDARD_3_2:
        case AspectRatio.LANDSCAPE_3_2:
            width = CARD_WIDTHS.LANDSCAPE;
            imageHeight = 213;
            break;

        case AspectRatio.PORTRAIT_9_16:
        case AspectRatio.PORTRAIT_9_21:
            width = CARD_WIDTHS.PORTRAIT;
            imageHeight = aspectRatio === AspectRatio.PORTRAIT_9_21 ? 560 : 426;
            break;

        case AspectRatio.PORTRAIT_3_4:
        case AspectRatio.PORTRAIT_4_5:
            width = CARD_WIDTHS.PORTRAIT;
            imageHeight = aspectRatio === AspectRatio.PORTRAIT_4_5 ? 300 : 320;
            break;

        case AspectRatio.STANDARD_2_3:
        case AspectRatio.PORTRAIT_2_3:
            width = CARD_WIDTHS.PORTRAIT;
            imageHeight = 360;
            break;

        case AspectRatio.PORTRAIT_1_4:
        case AspectRatio.PORTRAIT_1_8:
            width = CARD_WIDTHS.PORTRAIT;
            imageHeight = aspectRatio === AspectRatio.PORTRAIT_1_8 ? 1920 : 960; // Extreme tall cards
            break;

        case AspectRatio.SQUARE:
        case AspectRatio.AUTO:
        default:
            width = CARD_WIDTHS.SQUARE;
            imageHeight = 280;
            break;
    }

    return {
        width,
        imageHeight, // Height of the visual image part
        totalHeight: imageHeight + (includeFooter ? FOOTER_HEIGHT : 0)
    };
};
