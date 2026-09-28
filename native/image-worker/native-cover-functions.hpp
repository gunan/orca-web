// SPDX-License-Identifier: AGPL-3.0-or-later
// Unchanged OrcaSlicer 2.4.2 GUI_Utils.cpp functions; upstream revision
// 8500fcdccaa10b5099ac20d252af3a7c560046f1. Reproduce with the build script.
bool generate_image(const std::string &filename, wxImage &image, wxSize img_size, int method)
{
    wxInitAllImageHandlers();

    bool    result = true;
    wxImage img;
    result = load_image(filename, img);
    if (!result) return result;

    image = wxImage(img_size);
    image.SetType(wxBITMAP_TYPE_PNG);
    if (!image.HasAlpha()) {
        image.InitAlpha();
    }

    //image.Clear(0);
    //unsigned char *alpha = image.GetAlpha();
    unsigned char* alpha = new unsigned char[image.GetWidth() *  image.GetHeight()];
    if (alpha) { ::memset(alpha, wxIMAGE_ALPHA_TRANSPARENT, image.GetWidth() * image.GetHeight()); }
    if (method == GERNERATE_IMAGE_RESIZE) {
        float h_factor   = img.GetHeight() / (float) image.GetHeight();
        float w_factor   = img.GetWidth() / (float) image.GetWidth();
        float factor     = std::min(h_factor, w_factor);
        int   tar_height = (int) ((float) img.GetHeight() / factor);
        int   tar_width  = (int) ((float) img.GetWidth() / factor);
        img              = img.Rescale(tar_width, tar_height);
        image.Paste(img, (image.GetWidth() - tar_width) / 2, (image.GetHeight() - tar_height) / 2);
    } else if (method == GERNERATE_IMAGE_CROP_VERTICAL) {
        float w_factor   = img.GetWidth() / (float) image.GetWidth();
        int   tar_height = (int) ((float) img.GetHeight() / w_factor);
        int   tar_width  = (int) ((float) img.GetWidth() / w_factor);
        img              = img.Rescale(tar_width, tar_height);
        image.Paste(img, (image.GetWidth() - tar_width) / 2, (image.GetHeight() - tar_height) / 2);
    } else {
        return false;
    }

    //image.ConvertAlphaToMask(image.GetMaskRed(), image.GetMaskGreen(), image.GetMaskBlue());
    return true;
}
