#pragma once
#include <openssl/hmac.h>
#include <openssl/evp.h>
typedef enum { MBEDTLS_MD_SHA256 = 6 } mbedtls_md_type_t;
typedef struct { int dummy; } mbedtls_md_info_t;
inline const mbedtls_md_info_t* mbedtls_md_info_from_type(mbedtls_md_type_t) { static mbedtls_md_info_t i; return &i; }
inline int mbedtls_md_hmac(const mbedtls_md_info_t*, const unsigned char* key, size_t kl, const unsigned char* in, size_t il, unsigned char* out) {
  unsigned int ol = 0; return HMAC(EVP_sha256(), key, (int)kl, in, il, out, &ol) ? 0 : -1; }
