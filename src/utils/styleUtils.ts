import { AspectRatio } from '../types';

export const CARD_WIDTHS = {
    LANDSCAPE: 320,
    SQUARE: 280,
    PORTRAIT: 240, // Increased from 200 for better text fit
};

export const FOOTER_HEIGHT = 60; // Standard footer height for Image Cards

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
            width = CARD_WIDTHS.LANDSCAPE;
            // Height = Width / Ratio
            // 16:9 => 320 / (16/9) = 180
            // 21:9 => 320 / (21/9) = 137
            imageHeight = aspectRatio === AspectRatio.LANDSCAPE_21_9 ? 137 : 180;
            break;

        case AspectRatio.LANDSCAPE_4_3:
            width = CARD_WIDTHS.LANDSCAPE;
            imageHeight = 240; // 320 / (4/3)
            break;

        case AspectRatio.STANDARD_3_2:
            width = CARD_WIDTHS.LANDSCAPE;
            imageHeight = 213; // 320 / 1.5
            break;

        case AspectRatio.PORTRAIT_9_16:
            width = CARD_WIDTHS.PORTRAIT;
            imageHeight = 426; // 240 / (9/16)
            break;

        case AspectRatio.PORTRAIT_3_4:
            width = CARD_WIDTHS.PORTRAIT;
            imageHeight = 320; // 240 / (3/4)
            break;

        case AspectRatio.STANDARD_2_3:
            width = CARD_WIDTHS.PORTRAIT;
            imageHeight = 360; // 240 / (2/3)
            break;

        case AspectRatio.SQUARE:
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
