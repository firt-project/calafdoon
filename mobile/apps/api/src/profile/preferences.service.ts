import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Gender, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ScoreRecalcStub } from "./score-recalc.stub";
import { isDiscoverable } from "../common/review-status";
import { ProfileService } from "./profile.service";

const PREF_KEYS = [
  "preferredGender",
  "minAge",
  "maxAge",
  "minHeight",
  "maxHeight",
  "minWeight",
  "maxWeight",
  "preferredCountries",
  "acceptChildren",
  "educationLevel",
  "religiousLevel",
  "acceptDivorcee",
  "acceptWidow",
  "maxDistance",
  "qualities",
  "hobbies",
  "partnerBeard",
  "partnerHijabLevel",
  "readyToRelocate",
] as const;

@Injectable()
export class PreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreStub: ScoreRecalcStub,
    private readonly profiles: ProfileService
  ) {}

  async getMe(userId: string) {
    const prefs = await this.prisma.preference.findUnique({
      where: { userId },
    });
    if (!prefs) throw new NotFoundException("Preferences not found");
    return this.toView(prefs);
  }

  async putMe(userId: string, body: Record<string, unknown>) {
    this.validateRanges(body);
    const profile = await this.profiles.requireProfile(userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const data = this.pick(body);
    const prefs = await this.prisma.preference.upsert({
      where: { userId },
      create: {
        convexId: ProfileService.localId("local_pref"),
        userId,
        convexUserId: user.convexId,
        preferredGender: (data.preferredGender as Gender) ??
          (profile.gender === "male" ? "female" : "male"),
        minAge: (data.minAge as number) ?? 18,
        maxAge: (data.maxAge as number) ?? 60,
        minHeight: (data.minHeight as number) ?? 150,
        maxHeight: (data.maxHeight as number) ?? 210,
        minWeight: (data.minWeight as number) ?? 45,
        maxWeight: (data.maxWeight as number) ?? 150,
        preferredCountries: (data.preferredCountries as string[]) ?? [],
        acceptChildren: (data.acceptChildren as string) ?? "",
        educationLevel: (data.educationLevel as string) ?? "Bachelor",
        acceptDivorcee: (data.acceptDivorcee as string) ?? "Depends",
        acceptWidow: (data.acceptWidow as string) ?? "Depends",
        qualities: (data.qualities as string[]) ?? [],
        hobbies: (data.hobbies as string[]) ?? [],
        religiousLevel: (data.religiousLevel as string) ?? null,
        maxDistance: (data.maxDistance as string) ?? null,
        partnerBeard: (data.partnerBeard as string) ?? "",
        partnerHijabLevel: (data.partnerHijabLevel as string) ?? "",
        readyToRelocate: (data.readyToRelocate as string) ?? null,
      },
      update: data as Prisma.PreferenceUpdateInput,
    });

    await this.prisma.profileAuditEvent.create({
      data: {
        userId,
        profileId: profile.id,
        action: "preferences_upsert",
        metadata: { mode: "put" },
      },
    });

    if (isDiscoverable(profile)) {
      await this.scoreStub.enqueue(userId, "preferences_put");
    }
    return this.toView(prefs);
  }

  async patchMe(userId: string, body: Record<string, unknown>) {
    this.validateRanges(body);
    const profile = await this.profiles.requireProfile(userId);
    const data = this.pick(body);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("No preference fields provided");
    }

    const existing = await this.prisma.preference.findUnique({
      where: { userId },
    });
    if (!existing) {
      return this.putMe(userId, body);
    }

    const prefs = await this.prisma.preference.update({
      where: { userId },
      data: data as Prisma.PreferenceUpdateInput,
    });

    await this.prisma.profileAuditEvent.create({
      data: {
        userId,
        profileId: profile.id,
        action: "preferences_upsert",
        metadata: { mode: "patch", fields: Object.keys(data) },
      },
    });

    if (isDiscoverable(profile)) {
      await this.scoreStub.enqueue(userId, "preferences_patch");
    }
    return this.toView(prefs);
  }

  private pick(body: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of PREF_KEYS) {
      if (body[key] !== undefined) out[key] = body[key];
    }
    return out;
  }

  private validateRanges(body: Record<string, unknown>) {
    const minAge = body.minAge as number | undefined;
    const maxAge = body.maxAge as number | undefined;
    const minHeight = body.minHeight as number | undefined;
    const maxHeight = body.maxHeight as number | undefined;
    const minWeight = body.minWeight as number | undefined;
    const maxWeight = body.maxWeight as number | undefined;
    if (minAge !== undefined && (minAge < 18 || minAge > 100)) {
      throw new BadRequestException("minAge out of range");
    }
    if (maxAge !== undefined && (maxAge < 18 || maxAge > 100)) {
      throw new BadRequestException("maxAge out of range");
    }
    if (
      minAge !== undefined &&
      maxAge !== undefined &&
      minAge > maxAge
    ) {
      throw new BadRequestException("minAge cannot exceed maxAge");
    }
    if (minHeight !== undefined && (minHeight < 100 || minHeight > 250)) {
      throw new BadRequestException("minHeight out of range");
    }
    if (maxHeight !== undefined && (maxHeight < 100 || maxHeight > 250)) {
      throw new BadRequestException("maxHeight out of range");
    }
    if (
      minHeight !== undefined &&
      maxHeight !== undefined &&
      minHeight > maxHeight
    ) {
      throw new BadRequestException("minHeight cannot exceed maxHeight");
    }
    if (minWeight !== undefined && (minWeight < 30 || minWeight > 300)) {
      throw new BadRequestException("minWeight out of range");
    }
    if (maxWeight !== undefined && (maxWeight < 30 || maxWeight > 300)) {
      throw new BadRequestException("maxWeight out of range");
    }
    if (
      minWeight !== undefined &&
      maxWeight !== undefined &&
      minWeight > maxWeight
    ) {
      throw new BadRequestException("minWeight cannot exceed maxWeight");
    }
  }

  private toView(prefs: {
    id: string;
    userId: string;
    preferredGender: Gender;
    minAge: number;
    maxAge: number;
    minHeight: number;
    maxHeight: number;
    minWeight: number;
    maxWeight: number;
    preferredCountries: string[];
    acceptChildren: string;
    educationLevel: string;
    religiousLevel: string | null;
    acceptDivorcee: string;
    acceptWidow: string;
    maxDistance: string | null;
    qualities: string[];
    hobbies: string[];
    partnerBeard: string | null;
    partnerHijabLevel: string | null;
    readyToRelocate: string | null;
    updatedAt: Date;
  }) {
    return {
      id: prefs.id,
      userId: prefs.userId,
      preferredGender: prefs.preferredGender,
      minAge: prefs.minAge,
      maxAge: prefs.maxAge,
      minHeight: prefs.minHeight,
      maxHeight: prefs.maxHeight,
      minWeight: prefs.minWeight,
      maxWeight: prefs.maxWeight,
      preferredCountries: prefs.preferredCountries,
      acceptChildren: prefs.acceptChildren,
      educationLevel: prefs.educationLevel,
      religiousLevel: prefs.religiousLevel,
      acceptDivorcee: prefs.acceptDivorcee,
      acceptWidow: prefs.acceptWidow,
      maxDistance: prefs.maxDistance,
      qualities: prefs.qualities,
      hobbies: prefs.hobbies,
      partnerBeard: prefs.partnerBeard,
      partnerHijabLevel: prefs.partnerHijabLevel,
      readyToRelocate: prefs.readyToRelocate,
      updatedAt: prefs.updatedAt.toISOString(),
    };
  }
}
