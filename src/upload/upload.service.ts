import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class UploadService {
    private readonly s3 = new S3Client({
        region: process.env.AWS_REGION || 'ap-southeast-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
    });

    private readonly bucket = process.env.AWS_S3_BUCKET!;

    async getPresignedUploadUrl(
        originalFilename: string,
        contentType: string,
    ): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
        const ext = originalFilename.split('.').pop() ?? 'jpg';
        const key = `products/${randomUUID()}.${ext}`;

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
        });

        // URL expires in 5 minutes — enough time for the frontend upload
        const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });
        const publicUrl = `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

        return { uploadUrl, publicUrl, key };
    }
}
